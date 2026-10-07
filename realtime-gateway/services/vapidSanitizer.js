/**
 * vapidSanitizer.js — NoteStandard VAPID JWA Signature Serializer (v1.0)
 *
 * Intercepts jwa('ES256').sign() to ensure the returned ECDSA signature
 * is formatted as RFC 7515 Base64URL text instead of a raw 64-byte Buffer.
 * Fixes Node 24 HTTP header validation ERR_INVALID_CHAR on WebPush VAPID headers.
 */

const jwaPath = require.resolve('jwa');
const originalJwa = require(jwaPath);

function createSanitizedJwa(algorithm) {
  const signerObj = originalJwa(algorithm);
  if (algorithm === 'ES256') {
    const origSign = signerObj.sign;
    signerObj.sign = function sign() {
      const sig = origSign.apply(this, arguments);
      if (Buffer.isBuffer(sig)) {
        return sig.toString('base64url');
      }
      return sig;
    };
  }
  return signerObj;
}

if (require.cache[jwaPath]) {
  require.cache[jwaPath].exports = createSanitizedJwa;
}

module.exports = createSanitizedJwa;
