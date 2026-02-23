/**
 * One-time script to create the 'chat-media' storage bucket in Supabase.
 * Run: node server/scripts/create-storage-bucket.js
 */
const path = require("path");

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env.development"),
  });
}
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const supabase = require(path.join(__dirname, "..", "config", "supabase"));

async function createBucket() {
  console.log("Creating chat-media storage bucket...");

  // First check if it already exists
  const { data: buckets, error: listError } = await supabase.storage
    .listBuckets();

  if (listError) {
    console.error("Error listing buckets:", listError.message);
    process.exit(1);
  }

  console.log(
    "Existing buckets:",
    buckets.map((b) => b.name).join(", ") || "(none)",
  );

  if (buckets.some((b) => b.name === "chat-media")) {
    console.log("✅ chat-media bucket already exists!");
    process.exit(0);
  }

  // Create the bucket (private — files accessed via signed URLs)
  const { data, error } = await supabase.storage.createBucket("chat-media", {
    public: false,
    fileSizeLimit: 52428800, // 50MB max file size
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  });

  if (error) {
    console.error("❌ Failed to create bucket:", error.message);
    process.exit(1);
  }

  console.log("✅ chat-media bucket created successfully!", data);
}

createBucket();
