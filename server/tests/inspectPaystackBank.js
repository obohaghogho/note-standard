require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

async function inspectPaystackMerchantDetails() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const client = axios.create({
    baseURL: "https://api.paystack.co",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
  });

  const endpoints = [
    { name: "GET /integration/payment_session_timeout", path: "/integration/payment_session_timeout" },
    { name: "GET /bank", path: "/bank" },
    { name: "GET /settlement", path: "/settlement" },
  ];

  for (const ep of endpoints) {
    try {
      const res = await client.get(ep.path);
      console.log(`✅ ${ep.name} -> Status ${res.status}:`, JSON.stringify(res.data, null, 2).substring(0, 400));
    } catch (err) {
      console.log(`❌ ${ep.name} -> Status ${err.response?.status}:`, JSON.stringify(err.response?.data || err.message));
    }
  }
}

inspectPaystackMerchantDetails();
