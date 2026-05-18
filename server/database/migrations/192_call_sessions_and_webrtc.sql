-- ============================================================
-- Migration 192: Call Sessions + WebRTC Infrastructure (HARDENED)
-- ============================================================
-- Adds persistent call session tracking to eliminate the
-- in-memory activeCalls Map problem. Survives gateway restarts,
-- supports multi-instance deployments, and enables call history.
-- Includes full production hardening constraints.
-- ============================================================

-- ── 1. Call Sessions Table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS call_sessions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  callee_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id    TEXT        NOT NULL,
  call_type          TEXT        NOT NULL CHECK (call_type IN ('audio', 'video')),
  status             TEXT        NOT NULL DEFAULT 'ringing'
                                CHECK (status IN ('ringing','connecting','active','ended','rejected','missed','failed')),

  -- SDP negotiation storage (trickle ICE safe)
  sdp_offer          TEXT,
  sdp_answer         TEXT,

  -- Timing
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at        TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  duration_seconds   INTEGER     GENERATED ALWAYS AS (
    CASE
      WHEN answered_at IS NOT NULL AND ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - answered_at))::INTEGER
      ELSE NULL
    END
  ) STORED,

  -- Metadata & Future-Proof Analytics Readiness
  end_reason         TEXT,  -- normal | timeout | rejected | network_error
  caller_ip          INET,
  network_quality    JSONB,
  disconnect_side    TEXT CHECK (disconnect_side IN ('caller', 'callee', 'system')),
  device_info        JSONB,
  reconnect_count    INTEGER     NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. ICE Candidate Buffer ───────────────────────────────────
-- Stores trickled ICE candidates before the remote peer connects.
-- Gateway reads these and replays them once the peer reconnects.
CREATE TABLE IF NOT EXISTS webrtc_ice_candidates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  from_user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  candidate       JSONB       NOT NULL,  -- full RTCIceCandidate object
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Hardened Indexes ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_call_sessions_caller    ON call_sessions(caller_id, status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_callee    ON call_sessions(callee_id, status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_conv      ON call_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status    ON call_sessions(status) WHERE status IN ('ringing','connecting','active');
CREATE INDEX IF NOT EXISTS idx_call_sessions_started   ON call_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ice_session             ON webrtc_ice_candidates(session_id, from_user_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status_updated ON call_sessions(status, updated_at);

-- ── 4. Unique Active Session Guard ────────────────────────────
-- Prevent duplicate active calls between the same users in the same conversation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_session_per_conversation
ON call_sessions(conversation_id)
WHERE status IN ('ringing', 'connecting', 'active');

-- ── 5. Auto-update updated_at ─────────────────────────────────
CREATE OR REPLACE FUNCTION update_call_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_sessions_updated_at ON call_sessions;
CREATE TRIGGER trg_call_sessions_updated_at
  BEFORE UPDATE ON call_sessions
  FOR EACH ROW EXECUTE FUNCTION update_call_sessions_updated_at();

-- ── 6. ICE Candidate Automatic Cleanup Trigger ────────────────
-- Automatically deletes trickled ICE candidates upon call termination.
CREATE OR REPLACE FUNCTION cleanup_call_candidates_on_termination()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('ended', 'failed', 'missed', 'rejected') THEN
    DELETE FROM webrtc_ice_candidates WHERE session_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_candidates ON call_sessions;
CREATE TRIGGER trg_cleanup_candidates
  AFTER UPDATE OF status ON call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_call_candidates_on_termination();

-- ── 7. Stale Session Cleanup Function ────────────────────────
-- Marks ringing/connecting sessions as 'missed' or 'failed' using production timeouts:
-- * Ringing timeout: 35 seconds
-- * Connecting timeout: 25 seconds
CREATE OR REPLACE FUNCTION cleanup_stale_call_sessions()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  affected_ringing INTEGER := 0;
  affected_connecting INTEGER := 0;
BEGIN
  -- Stale Ringing Calls Cleanup
  UPDATE call_sessions
    SET status     = 'missed',
        end_reason = 'timeout',
        ended_at   = NOW()
  WHERE status = 'ringing'
    AND started_at < NOW() - INTERVAL '35 seconds';

  GET DIAGNOSTICS affected_ringing = ROW_COUNT;

  -- Stale Connecting Calls Cleanup
  UPDATE call_sessions
    SET status     = 'failed',
        end_reason = 'timeout',
        ended_at   = NOW()
  WHERE status = 'connecting'
    AND (answered_at IS NOT NULL AND answered_at < NOW() - INTERVAL '25 seconds');

  GET DIAGNOSTICS affected_connecting = ROW_COUNT;

  RETURN affected_ringing + affected_connecting;
END;
$$;

-- ── 8. RLS Hardening ──────────────────────────────────────────
ALTER TABLE call_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE webrtc_ice_candidates ENABLE ROW LEVEL SECURITY;

-- Exclude tables from Supabase Realtime Replication to prevent SDP/ICE data exposure
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    -- Check and drop call_sessions if present in publication
    IF EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND c.relname = 'call_sessions'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE call_sessions;
    END IF;

    -- Check and drop webrtc_ice_candidates if present in publication
    IF EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND c.relname = 'webrtc_ice_candidates'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE webrtc_ice_candidates;
    END IF;
  END IF;
END $$;

-- SELECT: Users can see only their own call sessions
DROP POLICY IF EXISTS "call_sessions_own_view" ON call_sessions;
CREATE POLICY "call_sessions_own_view"
  ON call_sessions FOR SELECT
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Explicit write permissions ONLY for service role (deny direct public insert/update)
DROP POLICY IF EXISTS "call_sessions_service_write" ON call_sessions;
CREATE POLICY "call_sessions_service_write"
  ON call_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "ice_candidates_service_all" ON webrtc_ice_candidates;
CREATE POLICY "ice_candidates_service_all"
  ON webrtc_ice_candidates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 9. pg_notify Trigger for Realtime Gateway (Optimized) ──────
-- Fire notification only when status changes DISTINCTLY (avoiding notify storms)
CREATE OR REPLACE FUNCTION notify_call_session_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'type',    'to_user',
    'room',    NEW.callee_id::TEXT,
    'event',   'call:session_sync',
    'payload', json_build_object(
      'sessionId',      NEW.id,
      'status',         NEW.status,
      'callType',       NEW.call_type,
      'conversationId', NEW.conversation_id,
      'callerId',       NEW.caller_id,
      'calleeId',       NEW.callee_id,
      'endReason',      NEW.end_reason
    )
  );
  PERFORM pg_notify('realtime_events', payload::TEXT);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_session_notify ON call_sessions;
CREATE TRIGGER trg_call_session_notify
  AFTER INSERT OR UPDATE OF status ON call_sessions
  FOR EACH ROW
  WHEN (OLD IS NULL OR OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_call_session_change();

-- ── Done ──────────────────────────────────────────────────────
COMMENT ON TABLE call_sessions IS
  'Persistent WebRTC call sessions. Replaces the in-memory activeCalls Map. Survives gateway restarts.';

COMMENT ON TABLE webrtc_ice_candidates IS
  'Buffered trickle ICE candidates for late-joining WebRTC peers.';
