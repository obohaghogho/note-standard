const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const WalletService = require("../services/walletService");
const logger = require("../utils/logger");

async function upgradeAllMockAddresses() {
  console.log("Starting bulk upgrade of mock wallet addresses...");

  // 1. Find all wallets with mock (UUID) addresses for crypto assets
  const { data: wallets, error } = await supabase
    .from("wallets_store")
    .select("user_id, currency, network, address")
    .ilike("address", "%-%") // UUIDs have hyphens
    .in("currency", ["BTC", "ETH", "USDT", "USDC"]);

  if (error) {
    console.error("Error fetching wallets:", error);
    return;
  }

  if (wallets.length === 0) {
    console.log("No mock addresses found to upgrade.");
    return;
  }

  console.log(`Found ${wallets.length} mock addresses. Starting upgrade...`);

  let successCount = 0;
  let failureCount = 0;

  for (const wallet of wallets) {
    console.log(`Upgrading ${wallet.currency} (${wallet.network}) for user ${wallet.user_id}...`);
    try {
      const result = await WalletService.getAddress(wallet.user_id, wallet.currency, wallet.network);
      
      if (result.address && !result.address.includes("-")) {
        console.log(`✅ Success: ${wallet.currency} upgraded to ${result.address}`);
        successCount++;
      } else {
        console.log(`⚠️ Warning: ${wallet.currency} still has mock address: ${result.address}`);
        failureCount++;
      }
    } catch (err) {
      console.error(`❌ Failed to upgrade ${wallet.currency} for user ${wallet.user_id}:`, err.message);
      failureCount++;
    }
    
    // Slight delay to avoid hitting NOWPayments rate limits too hard if there are many
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\nUpgrade Summary:");
  console.log(`Total processed: ${wallets.length}`);
  console.log(`Successfully upgraded: ${successCount}`);
  console.log(`Failed/Skipped: ${failureCount}`);
}

upgradeAllMockAddresses()
  .then(() => {
    console.log("Migration finished.");
    process.exit(0);
  })
  .catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
