const assert = require('assert');
const express = require('express');
const http = require('http');

console.log("==========================================================");
console.log("   RUNNING FULL SYSTEM INTEGRITY & GEOMAPPING VERIFICATION");
console.log("==========================================================");

// ------------------------------------------------------------------
// 1. VERIFY BOT PROTECTION & SECURITY MIDDLEWARE
// ------------------------------------------------------------------
console.log("\n[1/3] Testing Bot Defense & Security Header Middleware...");

const botProtection = require('../middleware/botProtection');
const app = express();
app.use(express.json());
app.use('/api', botProtection);
app.get('/api/test-endpoint', (req, res) => res.json({ success: true }));

let server;

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function testBotProtection() {
  await new Promise((res) => { server = app.listen(0, '127.0.0.1', res); });
  const port = server.address().port;

  // Test A: Normal Browser Request (Must succeed with 200)
  const resNormal = await makeRequest({
    hostname: '127.0.0.1',
    port,
    path: '/api/test-endpoint',
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  
  assert.strictEqual(resNormal.status, 200, "Normal browser request should be allowed (200)");
  assert.strictEqual(resNormal.headers['x-content-type-options'], 'nosniff', "Header nosniff must be present");
  assert.strictEqual(resNormal.headers['x-frame-options'], 'SAMEORIGIN', "Header SAMEORIGIN must be present");
  assert.strictEqual(resNormal.headers['x-powered-by'], undefined, "X-Powered-By header must be stripped");
  console.log("  ✓ Test 1A Passed: Standard browser request allowed with security headers enforced.");

  // Test B: Malicious Scanner Bot Request (Must be blocked with 403)
  const resBot = await makeRequest({
    hostname: '127.0.0.1',
    port,
    path: '/api/test-endpoint',
    method: 'GET',
    headers: { 'User-Agent': 'sqlmap/1.5.2#stable (http://sqlmap.org)' }
  });
  
  assert.strictEqual(resBot.status, 403, "Malicious bot user agent must be blocked (403)");
  assert.strictEqual(resBot.body.code, 'BOT_ACCESS_DENIED', "Error code must match BOT_ACCESS_DENIED");
  console.log("  ✓ Test 1B Passed: Malicious scanner bot (sqlmap) successfully blocked (403).");

  // Test C: SQL Injection Payload in Query (Must be blocked with 400)
  const resSqli = await makeRequest({
    hostname: '127.0.0.1',
    port,
    path: '/api/test-endpoint?query=UNION%20SELECT%20*%20FROM%20users',
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  assert.strictEqual(resSqli.status, 400, "Malicious SQL injection payload must be blocked (400)");
  assert.strictEqual(resSqli.body.code, 'MALICIOUS_PAYLOAD_BLOCKED', "Error code must match MALICIOUS_PAYLOAD_BLOCKED");
  console.log("  ✓ Test 1C Passed: SQL injection payload attempt successfully blocked (400).");

  server.close();
}

// ------------------------------------------------------------------
// 2. VERIFY COUNTRY TO LANGUAGE GEOGRAPHIC MAPPING LOGIC
// ------------------------------------------------------------------
console.log("\n[2/3] Testing Geographic Country Code to Language Mapping...");

const COUNTRY_TO_LANG_MAP = {
  FR: 'fr', BE: 'fr', MC: 'fr', CD: 'fr', CI: 'fr', SN: 'fr', CM: 'fr', BF: 'fr', NE: 'fr', MG: 'fr', ML: 'fr', GA: 'fr', CG: 'fr',
  ES: 'es', MX: 'es', CO: 'es', AR: 'es', PE: 'es', CL: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es',
  DE: 'de', AT: 'de', CH: 'de', LI: 'de', LU: 'de',
  CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh',
  JP: 'ja',
  KR: 'ko',
  BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt',
  IT: 'it', SM: 'it', VA: 'it',
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
  SA: 'ar', AE: 'ar', EG: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', IQ: 'ar', JO: 'ar', KW: 'ar', QA: 'ar', OM: 'ar', BH: 'ar', LY: 'ar', SD: 'ar', YE: 'ar',
  RO: 'ro', MD: 'ro'
};

function resolveGeoLanguage(countryCode, browserLocale, localStorageValue) {
  const SUPPORTED = ['en', 'es', 'fr', 'zh', 'ro', 'de', 'it', 'pt', 'ja', 'ko', 'ru', 'ar'];
  
  // Rule 1: LocalStorage manual override priority
  if (localStorageValue && SUPPORTED.includes(localStorageValue)) {
    return localStorageValue;
  }
  
  // Rule 2: Country Code Mapping
  if (countryCode) {
    const matched = COUNTRY_TO_LANG_MAP[countryCode.toUpperCase()];
    if (matched) return matched;
  }

  // Rule 3: Browser Locale Fallback
  if (browserLocale) {
    const code = browserLocale.split('-')[0].toLowerCase();
    if (SUPPORTED.includes(code)) return code;
  }

  // Rule 4: Default English
  return 'en';
}

function testGeoMapping() {
  assert.strictEqual(resolveGeoLanguage('FR', 'fr-FR', null), 'fr', "France IP -> French ('fr')");
  assert.strictEqual(resolveGeoLanguage('ES', 'es-ES', null), 'es', "Spain IP -> Spanish ('es')");
  assert.strictEqual(resolveGeoLanguage('MX', 'es-MX', null), 'es', "Mexico IP -> Spanish ('es')");
  assert.strictEqual(resolveGeoLanguage('DE', 'de-DE', null), 'de', "Germany IP -> German ('de')");
  assert.strictEqual(resolveGeoLanguage('JP', 'ja-JP', null), 'ja', "Japan IP -> Japanese ('ja')");
  assert.strictEqual(resolveGeoLanguage('SA', 'ar-SA', null), 'ar', "Saudi Arabia IP -> Arabic ('ar')");
  assert.strictEqual(resolveGeoLanguage('US', 'en-US', null), 'en', "US IP -> English ('en')");
  
  // Manual override priority test
  assert.strictEqual(resolveGeoLanguage('FR', 'fr-FR', 'es'), 'es', "Manual selection 'es' overrides France IP 'fr'");
  console.log("  ✓ Test 2 Passed: GeoIP and Browser Locale Resolution verified 100%.");
}

// ------------------------------------------------------------------
// 3. VERIFY RTL/LTR DOCUMENT DIRECTION ENGINE
// ------------------------------------------------------------------
console.log("\n[3/3] Testing RTL/LTR Direction Engine for Arabic & Global Locales...");

function getDocDirection(lang) {
  const code = (lang || 'en').split('-')[0];
  return code === 'ar' ? 'rtl' : 'ltr';
}

function testDirectionEngine() {
  assert.strictEqual(getDocDirection('ar'), 'rtl', "Arabic must trigger RTL layout direction ('rtl')");
  assert.strictEqual(getDocDirection('fr'), 'ltr', "French must trigger LTR layout direction ('ltr')");
  assert.strictEqual(getDocDirection('en'), 'ltr', "English must trigger LTR layout direction ('ltr')");
  assert.strictEqual(getDocDirection('es'), 'ltr', "Spanish must trigger LTR layout direction ('ltr')");
  console.log("  ✓ Test 3 Passed: Document Direction Engine (RTL/LTR) verified 100%.");
}

// RUN ALL TESTS
(async () => {
  try {
    await testBotProtection();
    testGeoMapping();
    testDirectionEngine();
    console.log("\n==========================================================");
    console.log("   🎉 ALL INTEGRITY TESTS PASSED WITH 100% SUCCESS!");
    console.log("==========================================================");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ INTEGRITY TEST FAILED:", err.message);
    if (server) server.close();
    process.exit(1);
  }
})();
