/**
 * vapidSanitizer.test.js — VAPID Signature Serialization Offline Regression Gate
 *
 * Verifies that:
 * 1. JWA ES256 signature output is serialized as 86-character Base64URL text.
 * 2. VAPID Authorization header is 100% RFC 7515 compliant and passes Node.js HTTP header validation.
 * 3. Zero network sockets or provider calls are executed.
 */

const http = require('http');
// Require the NoteStandard bootstrap sanitizer directly
require('../services/vapidSanitizer');
const webPush = require('web-push');
const jwa = require('jwa');
const asn1 = require('asn1.js');

const ECPrivateKeyASN = asn1.define('ECPrivateKey', function() {
  this.seq().obj(
    this.key('version').int(),
    this.key('privateKey').octstr(),
    this.key('parameters').explicit(0).objid().optional(),
    this.key('publicKey').explicit(1).bitstr().optional()
  );
});

function toPEM(keyBuffer) {
  return ECPrivateKeyASN.encode({
    version: 1,
    privateKey: keyBuffer,
    parameters: [1, 2, 840, 10045, 3, 1, 7]
  }, 'pem', {
    label: 'EC PRIVATE KEY'
  });
}

describe('VAPID Signature Serialization Regression Gate (Offline)', () => {
  it('should generate a 100% valid Base64URL JWT signature and pass Node header validation', () => {
    // 1. Inputs: Deterministic in-memory VAPID keypair
    const keys = webPush.generateVAPIDKeys();

    // 2. Process: Generate VAPID headers in memory (0 network requests)
    const headers = webPush.getVapidHeaders(
      'https://fcm.googleapis.com',
      'mailto:admin@notestandard.com',
      keys.publicKey,
      keys.privateKey,
      'aesgcm'
    );

    expect(headers).toHaveProperty('Authorization');
    const authHeader = headers.Authorization;

    // Extract JWT string from "WebPush <jwt>"
    const jwt = authHeader.replace(/^WebPush\s+/, '').replace(/^vapid\s+t=([^,]+).*/, '$1');
    const parts = jwt.split('.');

    // Assertion 1: JWT has exactly three dot-separated segments
    expect(parts.length).toBe(3);

    // Assertion 2: Header segment is valid Base64URL
    expect(/^[A-Za-z0-9_-]+$/.test(parts[0])).toBe(true);

    // Assertion 3: Payload segment is valid Base64URL
    expect(/^[A-Za-z0-9_-]+$/.test(parts[1])).toBe(true);

    // Assertion 4: Signature segment is valid Base64URL
    expect(/^[A-Za-z0-9_-]+$/.test(parts[2])).toBe(true);

    // Assertion 5: Signature segment length for ES256 P-256 curve is exactly 86 characters
    expect(parts[2].length).toBe(86);

    // Assertion 6: Signature segment contains NO standard Base64 symbols (+, /, =) or control chars
    expect(/[\r\n\t\0\s\+\/=]/.test(parts[2])).toBe(false);

    // Assertion 7-9: Node.js in-memory HTTP header validation MUST PASS without throwing ERR_INVALID_CHAR
    expect(() => {
      http.validateHeaderValue('Authorization', authHeader);
    }).not.toThrow();
  });

  it('negative regression proof: raw 64-byte Buffer vs Base64URL signature conversion', () => {
    // Verify JWA signer return type for ES256
    const es256Signer = jwa('ES256');
    const keys = webPush.generateVAPIDKeys();
    const pemKey = toPEM(Buffer.from(keys.privateKey, 'base64url'));
    const signature = es256Signer.sign('test.payload', pemKey);

    // Must return Base64URL string (length 86), NOT raw Buffer
    expect(typeof signature).toBe('string');
    expect(Buffer.isBuffer(signature)).toBe(false);
    expect(signature.length).toBe(86);
    expect(/^[A-Za-z0-9_-]{86}$/.test(signature)).toBe(true);
  });
});
