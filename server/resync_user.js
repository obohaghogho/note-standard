require("dotenv").config();
const supabase = require("./config/database");
const subscriptionController = require("./controllers/subscriptionController");

// Manually trigger sync for the affected user
async function resyncUser() {
  const reference = "989ccdb0-ab1f-4407-bba2-8665cbf6ca12";
  const userId = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";

  console.log(`Re-syncing for user ${userId} with reference ${reference}`);

  // We mock a request/response object to call the controller method
  const req = {
    body: { reference, method: "paystack" },
    user: { id: userId }
  };
  const res = {
    json: (data) => console.log("Response:", JSON.stringify(data, null, 2)),
    status: (code) => {
      console.log("Status Code:", code);
      return res;
    }
  };

  try {
    await subscriptionController.syncSubscription(req, res);
    console.log("Re-sync complete.");
  } catch (error) {
    console.error("Re-sync Error:", error);
  }
}

resyncUser();
