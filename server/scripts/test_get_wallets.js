require("dotenv").config({ path: __dirname + "/../.env" });
process.env.SUPABASE_URL = process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const walletService = require("../services/walletService");

async function testFetch() {
  try {
    const userId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd"; // From user logs
    const res = await walletService.getWallets(userId);
    require("fs").writeFileSync(
      "debug_get_wallets.json",
      JSON.stringify({ wallets: res }, null, 2),
    );
    console.log("Written to debug_get_wallets.json");
  } catch (err) {
    console.error("Failure:", err);
  }
}
testFetch();
