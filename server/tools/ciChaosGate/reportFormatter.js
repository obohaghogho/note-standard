const fs = require("fs");
const path = require("path");

function formatReport(chaosResult, accResult, certificate) {
  const passed = (chaosResult.success ?? true)
    && (accResult?.violations?.length === 0)
    && (certificate?.certified === true);

  return {
    passed,
    summary: {
      // Phase 6.3 — Messaging Chaos Gate
      totalAnomalies: chaosResult.anomalies ?? 0,
      leaseConflicts: chaosResult.leaseConflicts ?? 0,
      queueFailures: chaosResult.queueFailures ?? 0,

      // Phase 8.2 — ACC Chaos Lab
      accViolations: accResult?.violations?.length ?? 0,
      accP95Latency: accResult?.metrics?.p95_latency ?? 0,
      accDelayRate: accResult?.metrics?.delay_rate ?? "0.00",

      // Phase 8.3 — Replay Certification
      certified: certificate?.certified ?? false,
      ledgerHash: certificate?.ledgerHash ?? null,
      stateHash: certificate?.stateHash ?? null
    }
  };
}

function writeReportToFile(report) {
  const outPath = path.resolve(process.cwd(), "acc_chaos_report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`[CI] Report written to ${outPath}`);
}

module.exports = { formatReport, writeReportToFile };
