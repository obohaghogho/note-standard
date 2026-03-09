const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function fixBalanceConsistency() {
  console.log("--- Fixing Balance Consistency & View Trigger ---");

  // 1. Update the trigger function
  const fixTriggerSql = `
    CREATE OR REPLACE FUNCTION public.trg_wallets_upsert_fn()
    RETURNS TRIGGER AS $$
    BEGIN
        IF (TG_OP = 'INSERT') THEN
            INSERT INTO public.wallets_store (id, user_id, currency, address, is_frozen, balance, available_balance, network, provider)
            VALUES (
                COALESCE(NEW.id, uuid_generate_v4()), 
                NEW.user_id, 
                NEW.currency, 
                NEW.address, 
                COALESCE(NEW.is_frozen, false),
                COALESCE(NEW.balance, 0),
                COALESCE(NEW.available_balance, 0),
                COALESCE(NEW.network, 'native'),
                COALESCE(NEW.provider, 'internal')
            )
            RETURNING * INTO NEW;
            RETURN NEW;
        ELSIF (TG_OP = 'UPDATE') THEN
            UPDATE public.wallets_store
            SET address = NEW.address,
                is_frozen = NEW.is_frozen,
                balance = NEW.balance,
                available_balance = NEW.available_balance,
                updated_at = NOW()
            WHERE id = OLD.id;
            RETURN NEW;
        END IF;
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `;

  // 2. Synchronize existing desynced wallets
  const syncSql = `
    UPDATE public.wallets_store 
    SET available_balance = balance 
    WHERE (available_balance = 0 OR available_balance IS NULL) AND balance > 0;
  `;

  console.log("Applying trigger fix...");
  const { error: triggerError } = await supabase.rpc("exec_sql", {
    query: fixTriggerSql,
  });
  if (triggerError) {
    console.error("Failed to update trigger:", triggerError.message);
  } else {
    console.log("Trigger fix applied successfully.");
  }

  console.log("Syncing desynced balances...");
  const { error: syncError } = await supabase.rpc("exec_sql", {
    query: syncSql,
  });
  if (syncError) {
    console.error("Failed to sync balances:", syncError.message);
  } else {
    console.log("Balances synced successfully.");
  }
}

fixBalanceConsistency().catch(console.error);
