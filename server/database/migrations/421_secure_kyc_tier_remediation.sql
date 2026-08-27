-- Migration 421: Secure KYC Tier 0-3 Remediation & Verification Schema
-- ─────────────────────────────────────────────────────────────────────────────
-- Fixes client self-promotion vulnerabilities, creates public.kyc_verification_requests,
-- adds permission flags, and establishes database-level guards on profiles.

-- 1. Add KYC review permission column to profiles if not present
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_review_kyc BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id_card_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS utility_bill_url TEXT;

-- 2. Create kyc_verification_requests table
CREATE TABLE IF NOT EXISTS public.kyc_verification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    requested_tier INTEGER NOT NULL CHECK (requested_tier IN (1, 2, 3)),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW' 
        CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED', 'CANCELLED')),
    government_id_storage_path TEXT,
    utility_bill_storage_path TEXT,
    residential_address JSONB DEFAULT '{}'::jsonb,
    occupation TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.profiles(id),
    rejection_reason TEXT,
    reviewer_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Performance & Compliance Indexes
CREATE INDEX IF NOT EXISTS idx_kyc_req_user_id ON public.kyc_verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_req_status ON public.kyc_verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_kyc_req_requested_tier ON public.kyc_verification_requests(requested_tier);
CREATE INDEX IF NOT EXISTS idx_kyc_req_submitted_at ON public.kyc_verification_requests(submitted_at);
CREATE INDEX IF NOT EXISTS idx_kyc_req_reviewed_at ON public.kyc_verification_requests(reviewed_at);

-- 4. Enable Row Level Security
ALTER TABLE public.kyc_verification_requests ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for kyc_verification_requests
DROP POLICY IF EXISTS "Users can view own kyc requests" ON public.kyc_verification_requests;
CREATE POLICY "Users can view own kyc requests"
    ON public.kyc_verification_requests FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own kyc requests" ON public.kyc_verification_requests;
CREATE POLICY "Users can insert own kyc requests"
    ON public.kyc_verification_requests FOR INSERT
    WITH CHECK (auth.uid() = user_id AND status = 'PENDING_REVIEW');

DROP POLICY IF EXISTS "Admins and reviewers can view all kyc requests" ON public.kyc_verification_requests;
CREATE POLICY "Admins and reviewers can view all kyc requests"
    ON public.kyc_verification_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND (role = 'admin' OR plan_tier = 'admin' OR can_review_kyc = true)
        )
    );

DROP POLICY IF EXISTS "Admins and reviewers can update kyc requests" ON public.kyc_verification_requests;
CREATE POLICY "Admins and reviewers can update kyc requests"
    ON public.kyc_verification_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND (role = 'admin' OR plan_tier = 'admin' OR can_review_kyc = true)
        )
    );

-- 6. Trigger to Prevent Self-Promotion on public.profiles
CREATE OR REPLACE FUNCTION public.prevent_client_kyc_level_self_promotion()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.kyc_level IS DISTINCT FROM NEW.kyc_level OR OLD.is_verified IS DISTINCT FROM NEW.is_verified OR OLD.can_review_kyc IS DISTINCT FROM NEW.can_review_kyc) THEN
      -- Check if caller is authenticated standard user (not service_role or admin)
      IF (current_setting('role', true) = 'authenticated' AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role') THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() AND (role = 'admin' OR plan_tier = 'admin')
        ) THEN
          RAISE EXCEPTION 'UNAUTHORIZED_KYC_PROMOTION: Standard authenticated users cannot modify authoritative KYC fields (kyc_level, is_verified, can_review_kyc). KYC requests must be submitted for compliance review.';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_client_kyc_level_self_promotion ON public.profiles;
CREATE TRIGGER trg_prevent_client_kyc_level_self_promotion
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_kyc_level_self_promotion();
