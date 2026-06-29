-- Migration 229: Atomic poll vote counter trigger
-- Replaces the manual read/write in votePollOption with a DB-level atomic increment.
-- This is safe under concurrent load and eliminates the race condition.

-- 1. Trigger function: increments votes_count when a vote is inserted,
--    decrements when one is deleted (for future undo-vote support).
CREATE OR REPLACE FUNCTION increment_poll_option_votes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_poll_options
    SET votes_count = votes_count + 1
    WHERE id = NEW.option_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_poll_options
    SET votes_count = GREATEST(votes_count - 1, 0)
    WHERE id = OLD.option_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop existing trigger if present (idempotent re-run)
DROP TRIGGER IF EXISTS trg_poll_vote_counter ON community_poll_votes;

-- 3. Create the trigger on INSERT and DELETE
CREATE TRIGGER trg_poll_vote_counter
AFTER INSERT OR DELETE ON community_poll_votes
FOR EACH ROW EXECUTE FUNCTION increment_poll_option_votes();

-- 4. RLS policies for poll tables (in case migration 228 didn't include them)
ALTER TABLE community_polls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read polls" ON community_polls;
CREATE POLICY "Public can read polls"
  ON community_polls FOR SELECT USING (true);

ALTER TABLE community_poll_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read poll options" ON community_poll_options;
CREATE POLICY "Public can read poll options"
  ON community_poll_options FOR SELECT USING (true);

ALTER TABLE community_poll_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can vote once" ON community_poll_votes;
CREATE POLICY "Users can vote once"
  ON community_poll_votes FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read votes" ON community_poll_votes;
CREATE POLICY "Users can read votes"
  ON community_poll_votes FOR SELECT USING (true);

-- 5. Re-sync existing vote counts in case any drifted (safe to run)
UPDATE community_poll_options po
SET votes_count = (
  SELECT COUNT(*) FROM community_poll_votes pv WHERE pv.option_id = po.id
);
