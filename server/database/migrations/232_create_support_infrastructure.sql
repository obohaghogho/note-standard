-- =====================================================
-- 232: CREATE SUPPORT INFRASTRUCTURE (ENTERPRISE)
-- =====================================================

-- 1. Permissions System
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, permission_id)
);

-- Seed basic support permissions
INSERT INTO permissions (name, description) VALUES
('support.receive_ticket', 'Receive new incoming support tickets'),
('support.reply', 'Reply to customer tickets'),
('support.assign', 'Assign tickets to agents'),
('support.close', 'Resolve and close tickets'),
('support.manage', 'Manage support queues and settings'),
('support.supervisor', 'Supervisor access for SLA overrides and overrides')
ON CONFLICT (name) DO NOTHING;

-- 2. Support Tickets Table
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'waiting', -- waiting, assigned, in_progress, waiting_for_customer, resolved, closed
    priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
    category TEXT,
    intent TEXT,
    confidence FLOAT,
    tags TEXT[] DEFAULT '{}'::text[],
    csat_score INTEGER,
    csat_feedback TEXT,
    ai_knowledge_feedback TEXT, -- helpful, missing_knowledge, wrong_answer, hallucination, poor_troubleshooting
    ai_debug_metadata JSONB DEFAULT '{}'::jsonb,
    assigned_at TIMESTAMP WITH TIME ZONE,
    first_response_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_conversation_id ON support_tickets(conversation_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trigger_update_support_tickets_updated_at
BEFORE UPDATE ON support_tickets
FOR EACH ROW EXECUTE FUNCTION update_support_tickets_updated_at();

-- 3. Support Ticket Events
CREATE TABLE IF NOT EXISTS support_ticket_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- created, assigned, customer_reply, agent_reply, status_changed, note_added, resolved, reopened
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_events_ticket_id ON support_ticket_events(ticket_id);

-- 4. Support Ticket Notes
CREATE TABLE IF NOT EXISTS support_ticket_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    note TEXT NOT NULL,
    visibility TEXT DEFAULT 'internal', -- internal, shared, system
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_notes_ticket_id ON support_ticket_notes(ticket_id);

-- 5. Support Ticket Attachments
CREATE TABLE IF NOT EXISTS support_ticket_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size BIGINT,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_attachments_ticket_id ON support_ticket_attachments(ticket_id);


-- RLS Policies setup
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION has_permission(user_id UUID, perm_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_permissions up
        JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = has_permission.user_id AND p.name = perm_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Everyone can read permissions
DROP POLICY IF EXISTS "Anyone can view permissions" ON permissions;
CREATE POLICY "Anyone can view permissions" ON permissions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage user permissions" ON user_permissions;
CREATE POLICY "Admins can manage user permissions" ON user_permissions FOR ALL USING (is_admin(auth.uid()));
DROP POLICY IF EXISTS "Users can view their own permissions" ON user_permissions;
CREATE POLICY "Users can view their own permissions" ON user_permissions FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- Tickets
DROP POLICY IF EXISTS "Support staff and users can view tickets" ON support_tickets;
CREATE POLICY "Support staff and users can view tickets" ON support_tickets FOR SELECT USING (
    has_permission(auth.uid(), 'support.receive_ticket') OR customer_id = auth.uid() OR is_admin(auth.uid())
);
DROP POLICY IF EXISTS "Support staff can update tickets" ON support_tickets;
CREATE POLICY "Support staff can update tickets" ON support_tickets FOR UPDATE USING (
    has_permission(auth.uid(), 'support.receive_ticket') OR is_admin(auth.uid())
);
DROP POLICY IF EXISTS "System can insert tickets" ON support_tickets;
CREATE POLICY "System can insert tickets" ON support_tickets FOR INSERT WITH CHECK (true); -- Usually API service role

-- Events
DROP POLICY IF EXISTS "Support staff and users can view events" ON support_ticket_events;
CREATE POLICY "Support staff and users can view events" ON support_ticket_events FOR SELECT USING (
    EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND (t.customer_id = auth.uid() OR has_permission(auth.uid(), 'support.receive_ticket') OR is_admin(auth.uid())))
);
DROP POLICY IF EXISTS "System can insert events" ON support_ticket_events;
CREATE POLICY "System can insert events" ON support_ticket_events FOR INSERT WITH CHECK (true);

-- Notes
DROP POLICY IF EXISTS "Support staff can view internal notes" ON support_ticket_notes;
CREATE POLICY "Support staff can view internal notes" ON support_ticket_notes FOR SELECT USING (
    has_permission(auth.uid(), 'support.receive_ticket') OR is_admin(auth.uid())
);
DROP POLICY IF EXISTS "Support staff can insert internal notes" ON support_ticket_notes;
CREATE POLICY "Support staff can insert internal notes" ON support_ticket_notes FOR INSERT WITH CHECK (
    has_permission(auth.uid(), 'support.receive_ticket') OR is_admin(auth.uid())
);

-- Attachments
DROP POLICY IF EXISTS "Support staff and users can view attachments" ON support_ticket_attachments;
CREATE POLICY "Support staff and users can view attachments" ON support_ticket_attachments FOR SELECT USING (
    EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND (t.customer_id = auth.uid() OR has_permission(auth.uid(), 'support.receive_ticket') OR is_admin(auth.uid())))
);
DROP POLICY IF EXISTS "Users can insert attachments" ON support_ticket_attachments;
CREATE POLICY "Users can insert attachments" ON support_ticket_attachments FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
);