const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const WalletService = require("../services/walletService");

async function testUpgradeFinal() {
  const userId = "5089c266-1ad6-4a83-b23f-064d65995345";
  const currency = "BTC";
  const network = "native";

  console.log(
    `Testing address generation/upgrade for User ${userId}, Asset ${currency}...`,
  );

  try {
    const result = await WalletService.getAddress(userId, currency, network);
    console.log("Result:", JSON.stringify(result, null, 2));

    if (result.address && !result.address.includes("-")) {
      console.log("SUCCESS: Real address generated!");
    } else {
      console.log("FAILURE: Still got a mock address or UUID.");
    }
  } catch (error) {
    console.error("Error during test:", error);
  }
}

testUpgradeFinal();
