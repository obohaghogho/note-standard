'use strict';

/**
 * Phase 10-G: Automated Cryptographic Audit Evidence Bundle Generator
 * ===================================================================
 * Compiles a cryptographically signed & hash-chained evidence package:
 * 1. Invariant Verification History & Status (INV-001..INV-004)
 * 2. Per-Provider Custody Reserve Proof & Liquidity Ratios
 * 3. Active Policy Governance Metadata & Versioned Checksums
 * 4. Transactional Outbox & Dead-Letter Queue Metrics
 * 5. Background Worker Heartbeat Summaries
 * 6. Cryptographic Digital Signature & Previous Bundle Hash Chaining
 */

const pool = require('../config/pgPool');
const treasuryService = require('../services/treasury/TreasuryService');
const cryptoReconciliationEngine = require('../services/reconciliation/CryptoReconciliationEngine');
const cryptoOutboxWorker = require('../workers/CryptoOutboxWorker');
const cryptoCustodySyncWorker = require('../workers/CryptoCustodySyncWorker');
const cryptoHash = require('crypto');
const fs = require('fs');
const path = require('path');

const AUDIT_SIGNING_SECRET = process.env.AUDIT_SIGNING_SECRET || 'notestandard-audit-secret-key-2026';

async function generateAuditEvidenceBundle(previousChecksum = 'sha256:0000000000000000000000000000000000000000000000000000000000000000') {
  console.log('[AuditEvidenceGenerator] Compiling Phase 10 Cryptographic Operational Evidence Package...');

  const startTime = Date.now();

  // 1. Fetch Latest Integrity Verification Report
  const integrityReport = await cryptoReconciliationEngine.runIntegrityVerification();

  // 2. Fetch Detailed Reserve Proof with Provider Concentration & Enforced Controls
  const reserveProof = await treasuryService.calculateDetailedReserveProof();

  // 3. Outbox Metrics
  const outboxMetrics = await cryptoOutboxWorker.getOutboxMetrics();

  // 4. Worker Heartbeats
  const workerHeartbeats = {
    outboxWorker: cryptoOutboxWorker.getHeartbeat(),
    custodySyncWorker: cryptoCustodySyncWorker.getHeartbeat()
  };

  // 5. System Config & Feature Flags
  const systemState = {
    mode: require('../config/SystemState').mode,
    features: require('../config/SystemState').features
  };

  const rawPayload = {
    bundleId: cryptoHash.randomUUID(),
    previousBundleChecksum: previousChecksum,
    generatedAt: new Date().toISOString(),
    schemaVersion: '1.0.0',
    systemState,
    integrityReport,
    reserveProof,
    outboxMetrics,
    workerHeartbeats
  };

  // Compute evidence package SHA-256 checksum for audit immutability
  const payloadString = JSON.stringify(rawPayload);
  const checksumHex = cryptoHash.createHash('sha256').update(payloadString).digest('hex');
  const checksum = `sha256:${checksumHex}`;

  // Generate Digital Cryptographic HMAC-SHA256 Signature for authenticity
  const hmac = cryptoHash.createHmac('sha256', AUDIT_SIGNING_SECRET);
  hmac.update(checksum);
  const signatureHex = hmac.digest('hex');

  const evidencePackage = {
    checksum,
    signature: {
      algorithm: 'HMAC-SHA256',
      keyId: 'audit-key-2026-v1',
      signature: signatureHex
    },
    payload: rawPayload,
    durationMs: Date.now() - startTime
  };

  console.log(`✓ [AuditEvidenceGenerator] Cryptographic Evidence Bundle Generated in ${evidencePackage.durationMs}ms.`);
  console.log(`  Package Checksum: ${evidencePackage.checksum}`);
  console.log(`  Digital Signature: ${evidencePackage.signature.signature.substring(0, 16)}... (Key: ${evidencePackage.signature.keyId})`);
  console.log(`  Integrity Status:  ${integrityReport.status}`);
  console.log(`  Overall Status:    ${integrityReport.failed_checks.overallStatus}`);

  return evidencePackage;
}

if (require.main === module) {
  generateAuditEvidenceBundle()
    .then(bundle => {
      const outPath = path.join(__dirname, '..', '..', 'artifacts', `audit_evidence_${Date.now()}.json`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2));
      console.log(`Saved signed audit evidence bundle to: ${outPath}`);
    })
    .catch(err => console.error('Error generating evidence bundle:', err))
    .finally(() => pool.end());
}

module.exports = { generateAuditEvidenceBundle };
