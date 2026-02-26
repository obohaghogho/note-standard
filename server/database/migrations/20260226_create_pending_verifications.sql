-- Create table for pending verifications
CREATE TABLE IF NOT EXISTS pending_verifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  full_name text NOT NULL,
  username text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  email_otp text NOT NULL, -- email otp
  otp_expires_at timestamp with time zone NOT NULL,
  email_verified boolean DEFAULT false,
  is_verified boolean DEFAULT false, -- final flag
  attempts integer DEFAULT 0,
  referrer_id uuid, -- Track who referred this user
  last_otp_sent_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS pending_verifications_email_idx ON pending_verifications(email);

-- Function to cleanup expired verifications
CREATE OR REPLACE FUNCTION cleanup_expired_verifications() 
RETURNS void AS $$
BEGIN
  DELETE FROM pending_verifications WHERE otp_expires_at < now();
END;
$$ LANGUAGE plpgsql;
