const https = require("https");
const crypto = require("crypto");

const TARGET_URL = "https://notestandard.com/.well-known/apple-developer-merchantid-domain-association";
const EXPECTED_HASH = "4e2fdd224e8c281c107b247c5c0ee0292f7c4ce11f9bd9c7c5b1a594dd3199bb";

async function verifyAppleDomain() {
  console.log(`Starting automated Apple Pay verification audit for: ${TARGET_URL}\n`);

  try {
    const response = await fetchUrl(TARGET_URL);

    console.log(`Status Code: ${response.statusCode}`);
    console.log(`Headers:`, response.headers);

    // 1. Status Audit
    if (response.statusCode !== 200) {
      throw new Error(`[CRITICAL] Status code is ${response.statusCode}, expected 200!`);
    }

    // 2. Redirect Audit
    if (response.redirects && response.redirects.length > 0) {
      throw new Error(`[CRITICAL] Request was redirected via: ${response.redirects.join(" -> ")}`);
    }

    // 3. Body Checksum Validation
    const sha256 = crypto.createHash("sha256").update(response.body).digest("hex");
    console.log(`\nExpected SHA256: ${EXPECTED_HASH}`);
    console.log(`Actual SHA256:   ${sha256}`);

    if (sha256 !== EXPECTED_HASH) {
      throw new Error(`[CRITICAL] File checksum mismatch! The content might have been modified or intercepted by HTML/login page.`);
    }

    console.log(`\n🎉 Verification Passed: File is hosted correctly, publicly accessible, has 0 redirects, and has matching integrity hashes!`);
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ VERIFICATION FAILURE: ${error.message}`);
    console.error(`[ALERT] Payment Infrastructure Health: DANGER. Apple Pay verification failed.`);
    process.exit(1);
  }
}

function fetchUrl(url, redirectChain = []) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const { statusCode } = res;

      // Handle redirect manually to audit redirects
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).toString();
        redirectChain.push(`${statusCode} -> ${nextUrl}`);
        if (redirectChain.length > 5) {
          return reject(new Error("Too many redirects: potential infinite loop."));
        }
        return fetchUrl(nextUrl, redirectChain).then(resolve).catch(reject);
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
          redirects: redirectChain
        });
      });
    }).on("error", (err) => {
      reject(err);
    });
  });
}

verifyAppleDomain();
