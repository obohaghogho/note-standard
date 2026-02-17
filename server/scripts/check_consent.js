const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const supabase = require("../config/supabase");

async function checkConsent() {
  console.log("Checking all profiles for user_consent status...\n");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, username, user_consent, consent_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching profiles:", error);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  console.log(`Found ${profiles.length} profiles:\n`);
  profiles.forEach((p) => {
    const status = p.user_consent ? "✅ CONSENT" : "❌ NO CONSENT";
    console.log(
      `${status} | ${p.email || "no-email"} | ${
        p.username || "no-username"
      } | consent_at: ${p.consent_at || "null"}`,
    );
  });

  const noConsent = profiles.filter((p) => !p.user_consent);
  console.log(`\n${noConsent.length} profiles without consent.`);

  if (noConsent.length > 0) {
    console.log("\nFixing profiles without consent...");
    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({ user_consent: true, consent_at: new Date().toISOString() })
      .is("user_consent", null);

    if (updateError) {
      console.error("Update (null) error:", updateError);
    }

    const { error: updateError2 } = await supabase
      .from("profiles")
      .update({ user_consent: true, consent_at: new Date().toISOString() })
      .eq("user_consent", false);

    if (updateError2) {
      console.error("Update (false) error:", updateError2);
    }

    console.log("Done. Re-checking...");

    const { data: recheck } = await supabase
      .from("profiles")
      .select("email, user_consent")
      .or("user_consent.is.null,user_consent.eq.false");

    console.log("Profiles still without consent:", recheck?.length || 0);
  }
}

checkConsent();
