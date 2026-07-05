-- Migration: Phase 4B — Knowledge Commerce Platform
-- Products, bundles, entitlements, purchases, refunds, and commerce analytics.

-- ============================================================
-- 1. PRODUCT CATALOG
-- Unified commerce interface for all monetizable items.
-- ============================================================
CREATE TABLE IF NOT EXISTS commerce_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  space_id uuid REFERENCES community_spaces(id) ON DELETE CASCADE,
  
  -- Product Metadata
  title text NOT NULL,
  description text,
  product_type text NOT NULL CHECK (product_type IN (
    'learning_path', 'space_access', 'course', 'template_pack', 
    'flashcard_collection', 'quiz_pack', 'digital_download', 'bundle'
  )),
  
  -- Quality & Trust Badges (earned, not self-assigned)
  quality_badges text[] DEFAULT '{}',
  
  -- Pricing
  price_amount numeric NOT NULL DEFAULT 0.0,
  currency text NOT NULL DEFAULT 'USD',
  pricing_model text NOT NULL DEFAULT 'one_time' CHECK (pricing_model IN ('one_time', 'recurring_monthly', 'recurring_annual', 'free')),
  
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Nodes contained within a product
CREATE TABLE IF NOT EXISTS commerce_product_nodes (
  product_id uuid REFERENCES commerce_products(id) ON DELETE CASCADE,
  node_id uuid NOT NULL,
  node_type text NOT NULL,
  PRIMARY KEY (product_id, node_id, node_type)
);

-- Bundle engine: products containing other products
CREATE TABLE IF NOT EXISTS commerce_product_bundles (
  bundle_product_id uuid REFERENCES commerce_products(id) ON DELETE CASCADE,
  included_product_id uuid REFERENCES commerce_products(id) ON DELETE CASCADE,
  PRIMARY KEY (bundle_product_id, included_product_id)
);

-- Preview policies
CREATE TABLE IF NOT EXISTS commerce_preview_policies (
  product_id uuid PRIMARY KEY REFERENCES commerce_products(id) ON DELETE CASCADE,
  allowed_node_ids uuid[] DEFAULT '{}', -- Nodes that can be accessed with a preview entitlement
  time_limit_minutes integer,           -- Optional time-limited preview
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2. ENTITLEMENTS (ACCESS CONTROL)
-- Unified access layer, separating purchase records from authorization.
-- ============================================================
CREATE TABLE IF NOT EXISTS commerce_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES commerce_products(id) ON DELETE CASCADE,
  
  access_type text NOT NULL CHECK (access_type IN (
    'preview', 'purchased', 'subscription', 'organization', 'creator', 'admin'
  )),
  
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  
  -- Organization & Enterprise (Future readiness)
  org_id uuid,          -- Reference to future organizations table
  seat_count integer DEFAULT 1,
  department text,
  
  granted_at timestamptz DEFAULT now(),
  valid_until timestamptz,  -- NULL = lifetime access
  revoked_at timestamptz,
  revoke_reason text,
  
  UNIQUE(user_id, product_id)
);

-- ============================================================
-- 3. PURCHASES & REFUNDS
-- NoteStandard tracks state; payment providers execute funds.
-- ============================================================
CREATE TABLE IF NOT EXISTS commerce_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES commerce_products(id) ON DELETE CASCADE,
  
  -- Provider specifics
  provider text NOT NULL CHECK (provider IN ('paystack', 'nowpayments', 'stripe', 'manual')),
  provider_tx_id text UNIQUE NOT NULL,
  
  amount_paid numeric NOT NULL,
  currency text NOT NULL,
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'disputed')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commerce_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid REFERENCES commerce_purchases(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  reason text,
  processed_at timestamptz DEFAULT now()
);

-- ============================================================
-- 4. COMMERCE ANALYTICS & PRODUCT HEALTH
-- Health metrics exposed to creators.
-- ============================================================
CREATE TABLE IF NOT EXISTS commerce_product_health (
  product_id uuid PRIMARY KEY REFERENCES commerce_products(id) ON DELETE CASCADE,
  
  total_sales integer DEFAULT 0,
  total_revenue numeric DEFAULT 0.0,
  refund_count integer DEFAULT 0,
  
  -- Derived metrics
  conversion_rate_pct numeric DEFAULT 0,
  preview_to_purchase_pct numeric DEFAULT 0,
  refund_rate_pct numeric GENERATED ALWAYS AS (
    CASE WHEN total_sales > 0 THEN ROUND((refund_count::numeric / total_sales) * 100, 2) ELSE 0 END
  ) STORED,
  
  -- Quality signals
  avg_completion_pct numeric DEFAULT 0,
  avg_rating numeric DEFAULT 0,
  retention_score numeric DEFAULT 0,
  
  last_calculated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================
ALTER TABLE commerce_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products are publicly visible if active" ON commerce_products FOR SELECT USING (status = 'active');
CREATE POLICY "Creators manage own products" ON commerce_products FOR ALL USING (creator_id = auth.uid());

ALTER TABLE commerce_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own entitlements" ON commerce_entitlements FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service manages entitlements" ON commerce_entitlements FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE commerce_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own purchases" ON commerce_purchases FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service manages purchases" ON commerce_purchases FOR ALL USING (auth.role() = 'service_role');
