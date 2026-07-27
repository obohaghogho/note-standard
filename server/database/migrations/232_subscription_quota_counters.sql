-- Migration 232: Subscription Quota Counters & Triggers
-- Adds cached counters to profiles for O(1) plan quota checks

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS note_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0;

-- Function & Trigger: Sync note_count on INSERT, DELETE, TRASH RESTORE
CREATE OR REPLACE FUNCTION sync_user_note_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF (NEW.deleted_at IS NULL) THEN
      UPDATE profiles SET note_count = GREATEST(0, COALESCE(note_count, 0) + 1) WHERE id = NEW.owner_id;
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    IF (OLD.deleted_at IS NULL) THEN
      UPDATE profiles SET note_count = GREATEST(0, COALESCE(note_count, 0) - 1) WHERE id = OLD.owner_id;
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Soft delete: deleted_at set -> decrement count
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
      UPDATE profiles SET note_count = GREATEST(0, COALESCE(note_count, 0) - 1) WHERE id = NEW.owner_id;
    -- Soft delete restore: deleted_at cleared -> increment count
    ELSIF (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
      UPDATE profiles SET note_count = GREATEST(0, COALESCE(note_count, 0) + 1) WHERE id = NEW.owner_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_user_note_count ON notes;
CREATE TRIGGER trigger_sync_user_note_count
AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON notes
FOR EACH ROW EXECUTE FUNCTION sync_user_note_count();

-- Function & Trigger: Sync storage_used_bytes on note_files INSERT, DELETE
CREATE OR REPLACE FUNCTION sync_user_storage_used_bytes()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id UUID;
  v_file_size BIGINT;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    SELECT owner_id INTO v_owner_id FROM notes WHERE id = NEW.note_id;
    v_file_size := COALESCE(NEW.file_size, 0);
    IF (v_owner_id IS NOT NULL) THEN
      UPDATE profiles SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes, 0) + v_file_size) WHERE id = v_owner_id;
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    SELECT owner_id INTO v_owner_id FROM notes WHERE id = OLD.note_id;
    v_file_size := COALESCE(OLD.file_size, 0);
    IF (v_owner_id IS NOT NULL) THEN
      UPDATE profiles SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes, 0) - v_file_size) WHERE id = v_owner_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_user_storage_used_bytes ON note_files;
CREATE TRIGGER trigger_sync_user_storage_used_bytes
AFTER INSERT OR DELETE ON note_files
FOR EACH ROW EXECUTE FUNCTION sync_user_storage_used_bytes();
