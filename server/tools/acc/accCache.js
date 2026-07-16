const crypto = require('crypto');

const leaseCache = new Map();

function generateChecksum(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function getCachedLease(conversationId) {
  const entry = leaseCache.get(conversationId);

  // Hard timeout for cache staleness
  if (entry && Date.now() - entry.ts < 1500) {
    return entry.data;
  }

  return null;
}

function setCachedLease(conversationId, data, isShadowMode = false) {
  // CRITICAL: Shadow mode MUST NOT mutate cache state
  if (isShadowMode) return;

  const version = Date.now();
  const checksum = generateChecksum(data);

  leaseCache.set(conversationId, {
    data: { ...data, _version: version, _checksum: checksum },
    ts: version
  });
}

module.exports = { getCachedLease, setCachedLease, generateChecksum };
