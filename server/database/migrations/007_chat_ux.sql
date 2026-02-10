-- Migration 007: Add status to conversation_members for Message Requests layout

-- Add status column with check constraint
ALTER TABLE conversation_members 
ADD COLUMN IF NOT EXISTS status text CHECK (status IN ('pending', 'accepted', 'blocked')) DEFAULT 'pending';

-- Update existing members to 'accepted' so current chats don't break
UPDATE conversation_members SET status = 'accepted';

-- Create a function to auto-accept for the creator
CREATE OR REPLACE FUNCTION accept_for_creator()
RETURNS TRIGGER AS $$
BEGIN
    -- If the user is adding themselves (which happens on conversation creation), set status to accepted
    IF NEW.user_id = auth.uid() THEN
        NEW.status := 'accepted';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to accept for creator
DROP TRIGGER IF EXISTS set_creator_status ON conversation_members;
CREATE TRIGGER set_creator_status
BEFORE INSERT ON conversation_members
FOR EACH ROW
EXECUTE FUNCTION accept_for_creator();
