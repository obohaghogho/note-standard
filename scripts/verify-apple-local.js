const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILE_PATH = path.join(__dirname, "../client/public/.well-known/apple-developer-merchantid-domain-association");
const EXPECTED_HASH = "4e2fdd224e8c281c107b247c5c0ee0292f7c4ce11f9bd9c7c5b1a594dd3199bb";

function verifyLocalFile() {
  console.log(`[CI/CD Integrity Audit] Verifying local Apple Pay domain association file before build...`);

  // 1. Check existence
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`\n❌ INTEGRITY ERROR: Apple Pay domain verification file is MISSING!`);
    console.error(`Expected location: ${FILE_PATH}`);
    process.exit(1);
  }

  // 2. Validate checksum
  try {
    const fileBuffer = fs.readFileSync(FILE_PATH);
    const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    if (sha256 !== EXPECTED_HASH) {
      console.error(`\n❌ INTEGRITY ERROR: Apple Pay domain verification file content hash modified!`);
      console.error(`Expected: ${EXPECTED_HASH}`);
      console.error(`Actual:   ${sha256}`);
      process.exit(1);
    }

    console.log(`\n🎉 [CI/CD Integrity Audit] PASS: File exists and matches integrity checksum perfectly!\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ INTEGRITY ERROR: Failed to read domain association file: ${error.message}`);
    process.exit(1);
  }
}

verifyLocalFile();
