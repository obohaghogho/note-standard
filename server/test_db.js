const path = require("path");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL ||
    "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY || "placeholder",
);

async function test() {
  console.log("Testing Supabase connection...");
  console.log("URL:", process.env.SUPABASE_URL);
  try {
    const start = Date.now();
    const { data, error } = await supabase.from("profiles").select("count", {
      count: "exact",
      head: true,
    });
    const duration = Date.now() - start;
    if (error) {
      console.error("Connection failed:", error.message);
    } else {
      console.log("Connection successful!", {
        count: data,
        duration: `${duration}ms`,
      });
    }
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}

test();
