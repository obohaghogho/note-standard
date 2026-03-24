require("dotenv").config();
const PaystackProvider = require("./services/payment/providers/PaystackProvider.js");

async function testVerify() {
  console.log("Starting testVerify...");
  const provider = new PaystackProvider();
  
  // Mock the client.get method
  provider.client.get = async (url) => {
    console.log("Mocked client.get called with:", url);
    return {
      data: {
        data: {
          status: "success",
          amount: 4067972, // In kobo
          currency: "NGN",
          reference: "s8l4k0q9sj",
          metadata: {
            plan: "business",
            userId: "5089c266-1ad6-4a83-b23f-064d65995345",
            exchangeRate: 1356.44293
          }
        }
      }
    };
  };

  try {
    const result = await provider.verify("s8l4k0q9sj");
    console.log("Verification Result:", JSON.stringify(result, null, 2));
    
    if (result.metadata && result.metadata.plan === "business" && result.raw) {
      console.log("TEST PASSED: Metadata and Raw data are present.");
    } else {
      console.log("TEST FAILED: Metadata or Raw data is missing.");
      process.exit(1);
    }
  } catch (error) {
    console.error("Test Error:", error);
    process.exit(1);
  }
}

testVerify();
