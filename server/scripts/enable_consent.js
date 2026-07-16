const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const supabase = require("../config/supabase");

async function enableConsent() {
  console.log("Enabling user consent for all profiles...");

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        user_consent: true,
        consent_at: new Date().toISOString(),
      })
      .neq("user_consent", true); // Only update those that are false or null

    if (error) {
      console.error("Error enabling consent:", error);
    } else {
      console.log("Successfully enabled consent for profiles.");
      if (data) console.log("Updated rows:", data.length);
    }
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}

enableConsent();
