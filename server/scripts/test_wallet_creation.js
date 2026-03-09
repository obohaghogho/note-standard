require("dotenv").config();
const walletService = require("../services/walletService");
const supabase = require("../config/database");

async function testWalletCreation() {
  console.log("--- TEST: WALLET CREATION & UNIQUE CONSTRAINT ---");

  const testUserId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd"; // A user ID from logs

  // 1. Try to create USD Native (should already exist or be created)
  console.log("Fetching/Creating USD Native...");
  const w1 = await walletService.createWallet(testUserId, "USD", "native");
  console.log(`Wallet ID: ${w1.id}, Network: ${w1.network}`);

  // 2. Try to create USD with a mock network (should find the same wallet)
  console.log("\nFetching/Creating USD with different network 'internal'...");
  const w2 = await walletService.createWallet(testUserId, "USD", "internal");
  console.log(`Wallet ID: ${w2.id}, Network: ${w2.network}`);

  if (w1.id === w2.id) {
    console.log(
      "\nSUCCESS: Same wallet returned for same currency despite different network request.",
    );
  } else {
    console.log(
      "\nWARNING: Different wallets returned. Schema might not be as expected.",
    );
  }

  // 3. Verify crypto upgrade if mock
  console.log("\nTesting crypto upgrade logic...");
  const w3 = await walletService.createWallet(testUserId, "ETH", "native");
  console.log(`ETH Wallet Address: ${w3.address.substring(0, 10)}...`);

  const w4 = await walletService.createWallet(testUserId, "ETH", "ethereum");
  console.log(`ETH Wallet Upgrade Address: ${w4.address.substring(0, 10)}...`);
}

testWalletCreation().catch(console.error);
