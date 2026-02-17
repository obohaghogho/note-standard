const axios = require("axios");
const url = "https://notestandard.com/api/wallet/transactions";

async function check() {
  console.log("Checking server status...");
  try {
    const response = await axios.get(url, { timeout: 5000 });
    console.log("Server is UP! Response:", response.status);
    console.log("Data:", response.data);
  } catch (error) {
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.status,
        error.response.statusText,
      );
      if (error.response.status === 401) {
        console.log(
          "✅ SUCCESS: API is reachable (returned 401 Unauthorized as expected without token)",
        );
      } else {
        console.log("⚠️ WARNING: Unexpected status code");
      }
    } else {
      console.error("❌ Error connecting to server:", error.message);
      if (error.code === "ECONNREFUSED") {
        console.log("Server is likely not running yet or crashed.");
      }
    }
  }
}

setTimeout(check, 3000); // Wait 3s for server to init
