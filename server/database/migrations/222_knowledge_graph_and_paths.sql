-- Migration: Phase 2.5 — Knowledge Intelligence Layer
-- Establishes the Knowledge Graph: generic nodes, metadata-rich edges,
-- learning paths, knowledge health tracking, and user progress.

-- ============================================================
-- 1. KNOWLEDGE EDGES
-- A polymorphic edge table. Source and target can be any entity type.
-- This table is the heart of the graph.
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source Node
  source_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'post', 'wiki', 'collection', 'space', 'creator', 'learning_path', 'quiz', 'flashcard', 'template', 'event', 'media'
  )),

  -- Target Node
  target_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN (
    'post', 'wiki', 'collection', 'space', 'creator', 'learning_path', 'quiz', 'flashcard', 'template', 'event', 'media'
  )),

  -- Edge Classification
  edge_type text NOT NULL CHECK (edge_type IN (
    -- Deterministic (Confidence 1.0) — structurally explicit
    'belongs_to',        -- Post -> Space, Wiki -> Space
    'contains',          -- Collection -> Post, LearningPath -> Wiki
    'created_by',        -- Post -> Creator
    'references',        -- Post explicitly links to a Wiki
    -- Behavioral — inferred from user actions
    'co_viewed',         -- Users who viewed A also viewed B
    'co_saved',          -- Users who saved A also saved B
    'follows_from',      -- Users read A then B in sequence
    -- AI-inferred — suggestions pending review
    'similar_to',        -- Semantic similarity
    'prerequisite_of',   -- A should be learned before B
    'contradicts',       -- A contains information that may conflict with B
    'duplicate_of',      -- Near-duplicate content
    'mentions'           -- A textually mentions concept from B
  )),

  -- Confidence metadata (Hybrid 3-layer model)
  confidence numeric DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  status text DEFAULT 'verified' CHECK (status IN ('verified', 'inferred', 'pending', 'rejected')),
  reason text,                    -- Human-readable explanation for AI-inferred edges

  -- Origin tracking
  created_by_layer text DEFAULT 'deterministic' CHECK (created_by_layer IN ('deterministic', 'behavioral', 'ai')),
  created_by_user uuid REFERENCES profiles(id) ON DELETE SET NULL,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Prevent duplicate edges
  UNIQUE(source_id, source_type, target_id, target_type, edge_type)
);

-- Indexes for bidirectional traversal
CREATE INDEX IF NOT EXISTS idx_kedge_source ON knowledge_edges(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_kedge_target ON knowledge_edges(target_id, target_type);
CREATE INDEX IF NOT EXISTS idx_kedge_type ON knowledge_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_kedge_status ON knowledge_edges(status);
CREATE INDEX IF NOT EXISTS idx_kedge_confidence ON knowledge_edges(confidence DESC);


-- ============================================================
-- 2. KNOWLEDGE HEALTH
-- Tracks the freshness and quality of each individual node.
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL,
  node_type text NOT NULL,

  freshness_score numeric DEFAULT 100 CHECK (freshness_score BETWEEN 0 AND 100),
  citation_count integer DEFAULT 0,
  community_accuracy_score numeric DEFAULT 100 CHECK (community_accuracy_score BETWEEN 0 AND 100),

  last_reviewed_at timestamptz,
  last_updated_at timestamptz DEFAULT now(),

  -- Decay tracking: a background job will reduce freshness_score over time
  -- if the node has not been reviewed or updated
  decay_rate numeric DEFAULT 0.5, -- Points lost per week if not reviewed

  UNIQUE(node_id, node_type)
);

CREATE INDEX IF NOT EXISTS idx_khealth_node ON knowledge_health(node_id, node_type);
CREATE INDEX IF NOT EXISTS idx_khealth_freshness ON knowledge_health(freshness_score);


-- ============================================================
-- 3. LEARNING PATHS
-- Structured, ordered curricula defined per Space.
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid REFERENCES community_spaces(id) ON DELETE CASCADE,
  creator_id uuid REFERENCES profiles(id) ON DELETE SET NULL,

  title text NOT NULL,
  description text,
  level text NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  is_published boolean DEFAULT false,
  estimated_duration_minutes integer,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ordered nodes within a learning path (each node = a knowledge entity)
CREATE TABLE IF NOT EXISTS learning_path_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id uuid REFERENCES learning_paths(id) ON DELETE CASCADE,

  node_id uuid NOT NULL,
  node_type text NOT NULL CHECK (node_type IN ('post', 'wiki', 'quiz', 'flashcard', 'collection')),
  order_index integer NOT NULL,

  title text,       -- Optional override title for this step in the path
  description text, -- Optional context about why this step is included
  is_required boolean DEFAULT true,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lpath_space ON learning_paths(space_id);
CREATE INDEX IF NOT EXISTS idx_lpnode_path ON learning_path_nodes(path_id, order_index);


-- ============================================================
-- 4. USER KNOWLEDGE PROGRESS
-- Tracks a user's advancement through learning path nodes.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_knowledge_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  path_id uuid REFERENCES learning_paths(id) ON DELETE CASCADE,
  node_id uuid REFERENCES learning_path_nodes(id) ON DELETE CASCADE,

  status text DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  completed_at timestamptz,

  UNIQUE(user_id, node_id)
);

-- Computed view: Overall user progress per learning path
CREATE OR REPLACE VIEW user_path_completion AS
SELECT
  upk.user_id,
  upk.path_id,
  lp.title AS path_title,
  lp.level,
  COUNT(lpn.id)                                              AS total_nodes,
  COUNT(upk.id) FILTER (WHERE upk.status = 'completed')     AS completed_nodes,
  ROUND(
    COUNT(upk.id) FILTER (WHERE upk.status = 'completed') * 100.0
    / NULLIF(COUNT(lpn.id), 0), 1
  )                                                          AS completion_pct
FROM learning_path_nodes lpn
LEFT JOIN user_knowledge_progress upk
  ON upk.node_id = lpn.id
LEFT JOIN learning_paths lp
  ON lp.id = lpn.path_id
GROUP BY upk.user_id, upk.path_id, lp.title, lp.level;

CREATE INDEX IF NOT EXISTS idx_ukp_user_path ON user_knowledge_progress(user_id, path_id);


-- ============================================================
-- 5. ROW-LEVEL SECURITY
-- ============================================================

-- Knowledge Edges
ALTER TABLE knowledge_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified edges are public" ON knowledge_edges FOR SELECT USING (status = 'verified');
CREATE POLICY "Inferred edges visible to space members" ON knowledge_edges FOR SELECT USING (status = 'inferred');
CREATE POLICY "Service role can manage all edges" ON knowledge_edges FOR ALL USING (auth.role() = 'service_role');

-- Knowledge Health
ALTER TABLE knowledge_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Health metrics are public" ON knowledge_health FOR SELECT USING (true);
CREATE POLICY "Service role can manage health" ON knowledge_health FOR ALL USING (auth.role() = 'service_role');

-- Learning Paths
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published paths are public" ON learning_paths FOR SELECT USING (is_published = true);
CREATE POLICY "Creators can manage their paths" ON learning_paths FOR ALL USING (creator_id = auth.uid());

-- Learning Path Nodes
ALTER TABLE learning_path_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Path nodes are publicly readable" ON learning_path_nodes FOR SELECT USING (true);
CREATE POLICY "Path creators can manage nodes" ON learning_path_nodes FOR ALL USING (
  EXISTS (SELECT 1 FROM learning_paths WHERE id = path_id AND creator_id = auth.uid())
);

-- User Progress
ALTER TABLE user_knowledge_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own progress" ON user_knowledge_progress FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update their own progress" ON user_knowledge_progress FOR ALL USING (user_id = auth.uid());


-- ============================================================
-- 6. SEED: Deterministic Edge Generator Function
-- Called by backend triggers whenever a structural relationship
-- is established (e.g., a post is published into a space).
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_deterministic_edge(
  p_source_id uuid,
  p_source_type text,
  p_target_id uuid,
  p_target_type text,
  p_edge_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO knowledge_edges (
    source_id, source_type, target_id, target_type,
    edge_type, confidence, status, created_by_layer
  )
  VALUES (
    p_source_id, p_source_type, p_target_id, p_target_type,
    p_edge_type, 1.0, 'verified', 'deterministic'
  )
  ON CONFLICT (source_id, source_type, target_id, target_type, edge_type) DO NOTHING;
END;
$$;
