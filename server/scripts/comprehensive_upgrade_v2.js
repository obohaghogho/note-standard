const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const WalletService = require("../services/walletService");
const logger = require("../utils/logger");

const MOCK_IDENTIFIERS = [
  "-", // UUIDs
  "dummy",
  "mock",
  "test",
  "address",
  "123456",
  "example",
  "sample"
];

async function comprehensiveUpgrade() {
  console.log("Starting comprehensive mock address upgrade and consolidation...");

  // 1. Fetch all crypto wallets
  const { data: allWallets, error } = await supabase
    .from("wallets_store")
    .select("*")
    .in("currency", ["BTC", "ETH", "USDT", "USDC"]);

  if (error) {
    console.error("Error fetching wallets:", error);
    return;
  }

  console.log(`Analyzing ${allWallets.length} crypto wallets...`);

  // Group by user and currency to find redundancy
  const userWallets = {};
  allWallets.forEach(w => {
    const key = `${w.user_id}_${w.currency}`;
    if (!userWallets[key]) userWallets[key] = [];
    userWallets[key].push(w);
  });

  let upgradedCount = 0;
  let deletedCount = 0;

  for (const key in userWallets) {
    const wallets = userWallets[key];
    const [userId, currency] = key.split("_");

    // Strategy: 
    // If there are multiple wallets for the same user+currency, pick the best one and mark others for deletion
    // A wallet is "better" if it has balance, or a real address, or is the most recent.
    
    // Sort: real address first, then balance, then most recent
    wallets.sort((a, b) => {
      const aIsMock = MOCK_IDENTIFIERS.some(id => (a.address || "").toLowerCase().includes(id));
      const bIsMock = MOCK_IDENTIFIERS.some(id => (b.address || "").toLowerCase().includes(id));
      
      if (!aIsMock && bIsMock) return -1;
      if (aIsMock && !bIsMock) return 1;
      
      if (parseFloat(a.balance) > parseFloat(b.balance)) return -1;
      if (parseFloat(a.balance) < parseFloat(b.balance)) return 1;
      
      return new Date(b.created_at) - new Date(a.created_at);
    });

    const primaryWallet = wallets[0];
    const redundantWallets = wallets.slice(1);

    // 1. Upgrade the primary wallet if it's still mock
    const isPrimaryMock = MOCK_IDENTIFIERS.some(id => (primaryWallet.address || "").toLowerCase().includes(id));
    
    if (isPrimaryMock) {
      console.log(`Upgrading primary wallet ${primaryWallet.id} (${currency} ${primaryWallet.network}) for user ${userId}...`);
      try {
        const result = await WalletService.getAddress(userId, currency, primaryWallet.network);
        if (result.address && !MOCK_IDENTIFIERS.some(id => result.address.toLowerCase().includes(id))) {
          console.log(`✅ ${currency} upgraded to ${result.address}`);
          upgradedCount++;
        } else {
          console.log(`⚠️ Failed to get real address for ${currency}. Still got: ${result.address}`);
        }
      } catch (err) {
        console.error(`❌ Error upgrading ${currency} for user ${userId}:`, err.message);
      }
    }

    // 2. Handle redundant wallets
    for (const redundant of redundantWallets) {
      console.log(`Handling redundant wallet ${redundant.id} (${currency} ${redundant.network}) for user ${userId}...`);
      
      if (parseFloat(redundant.balance) > 0) {
        console.log(`💰 Redundant wallet has balance! Moving ${redundant.balance} to primary wallet...`);
        // Transfer balance via logic (or direct DB update for cleanup)
        const { error: moveError } = await supabase.rpc('consolidate_wallet_balance', {
          p_source_id: redundant.id,
          p_target_id: primaryWallet.id
        });
        
        if (moveError) {
          console.error(`❌ Failed to move balance: ${moveError.message}. Skipping deletion.`);
          continue;
        }
      }

      // Delete the redundant wallet
      const { error: delError } = await supabase.from("wallets_store").delete().eq("id", redundant.id);
      if (delError) {
        console.error(`❌ Failed to delete redundant wallet: ${delError.message}`);
      } else {
        console.log(`🗑️ Deleted redundant wallet ${redundant.id}`);
        deletedCount++;
      }
    }
  }

  console.log("\nMigration Summary:");
  console.log(`Upgraded: ${upgradedCount}`);
  console.log(`Redundant Deleted: ${deletedCount}`);
  console.log("Migration walk finished.");
}

comprehensiveUpgrade()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
