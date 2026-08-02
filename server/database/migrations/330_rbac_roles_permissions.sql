-- 330_rbac_roles_permissions.sql
-- NoteStandard Enterprise Banking Platform (Architecture v1.0)
-- Role-Based Access Control (RBAC) & Fine-Grained Permissions

CREATE TABLE IF NOT EXISTS public.rbac_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name VARCHAR(50) NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rbac_role_perm UNIQUE(role_name, permission_key)
);

-- Safe Schema Alterations
ALTER TABLE public.rbac_permissions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Safe Unique Constraint Addition
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_rbac_role_perm'
  ) THEN
    ALTER TABLE public.rbac_permissions ADD CONSTRAINT uq_rbac_role_perm UNIQUE (role_name, permission_key);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Seed Default RBAC Permissions
INSERT INTO public.rbac_permissions (role_name, permission_key, description)
VALUES
  ('BANKING_ADMIN', 'TREASURY_REBALANCE_WRITE', 'Allows executing internal treasury transfers'),
  ('BANKING_ADMIN', 'FEATURE_FLAG_WRITE', 'Allows toggling runtime production feature flags'),
  ('TREASURY_OFFICER', 'TREASURY_READ', 'View treasury account balances and snapshots'),
  ('AUDITOR', 'COMPLIANCE_AUDIT_READ', 'View immutable audit logs and ledger history')
ON CONFLICT (role_name, permission_key) DO NOTHING;
