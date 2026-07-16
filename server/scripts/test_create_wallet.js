require("dotenv").config({ path: __dirname + "/../.env" });
process.env.SUPABASE_URL = process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const walletService = require("../services/walletService");

async function testCreate() {
  try {
    const res = await walletService.createWallet(
      "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd",
      "EUR",
      "native",
    );
    console.log("Success:", res);
  } catch (err) {
    console.error("Failure:", err);
  }
}
testCreate();
