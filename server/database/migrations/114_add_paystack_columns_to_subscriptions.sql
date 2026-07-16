-- 114_add_paystack_columns_to_subscriptions.sql
-- Fixes "Could not find column" error during Paystack subscription sync

ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS paystack_subscription_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS paystack_transaction_reference VARCHAR(100),
ADD COLUMN IF NOT EXISTS paystack_email_token VARCHAR(100);

-- Metadata
COMMENT ON COLUMN public.subscriptions.paystack_customer_code IS 'Paystack customer code (CUS_xxx)';
COMMENT ON COLUMN public.subscriptions.paystack_transaction_reference IS 'Paystack transaction reference (trx_xxx)';
