const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function inspectAllAddresses() {
  console.log("Inspecting all crypto wallet addresses...");

  const { data: wallets, error } = await supabase
    .from("wallets_store")
    .select("currency, network, address, user_id")
    .in("currency", ["BTC", "ETH", "USDT", "USDC"]);

  if (error) {
    console.error("Error:", error);
    return;
  }

  const mockIdentifiers = [
    "-", // UUIDs
    "dummy",
    "mock",
    "test",
    "address",
    "123456",
    "example"
  ];

  console.log(`Total crypto wallets: ${wallets.length}`);
  
  const foundMocks = wallets.filter(w => {
    const addr = (w.address || "").toLowerCase();
    return mockIdentifiers.some(id => addr.includes(id));
  });

  if (foundMocks.length === 0) {
    console.log("No obvious mock addresses found with current filters.");
    // Show a sample of real-looking ones to be sure
    console.log("\nSample addresses:");
    wallets.slice(0, 10).forEach(w => console.log(`- ${w.currency}: ${w.address}`));
  } else {
    console.log(`\nFound ${foundMocks.length} potential mock addresses:`);
    foundMocks.forEach(w => {
      console.log(`- User: ${w.user_id} | ${w.currency} | ${w.address}`);
    });
  }
}

inspectAllAddresses();
