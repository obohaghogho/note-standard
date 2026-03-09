-- Migration 083: Set internal transfers to zero fee
-- Internal transfers (TRANSFER_OUT) should be free to encourage platform use.
-- External transfers (WITHDRAWAL) keep their fees to cover network costs.

UPDATE commission_settings 
SET value = 0.0 
WHERE transaction_type = 'TRANSFER_OUT';

-- Ensure admin_settings fallbacks for internal transfers are also low if they existed
-- (Though commission_settings takes precedence)
