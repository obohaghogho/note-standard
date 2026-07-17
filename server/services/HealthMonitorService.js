const SystemState = require("../config/SystemState");
const logger = require("../utils/logger");

class HealthMonitorService {
  constructor() {
    this.metrics = {
      providerLatencies: {}, // { 'paystack': [120, 150, ...], 'nowpayments': [...] }
      webhookIngestRate: 0,
      duplicateRejections: 0,
      rollbacks: 0,
      apiAvailability: {
        paystack: true,
        nowpayments: true
      },
      lastUpdated: Date.now()
    };
    
    // Rolling window limits
    this.maxLatencySamples = 100;
  }

  recordLatency(provider, ms) {
    if (!this.metrics.providerLatencies[provider]) {
      this.metrics.providerLatencies[provider] = [];
    }
    const arr = this.metrics.providerLatencies[provider];
    arr.push(ms);
    if (arr.length > this.maxLatencySamples) {
      arr.shift();
    }
    
    // Update availability heuristic based on latency/timeouts
    if (ms > 5000) {
      this.metrics.apiAvailability[provider] = false;
    } else {
      this.metrics.apiAvailability[provider] = true;
    }
  }

  recordWebhookIngest() {
    this.metrics.webhookIngestRate++;
  }

  recordDuplicate() {
    this.metrics.duplicateRejections++;
  }

  recordRollback() {
    this.metrics.rollbacks++;
  }

  getHealthSummary() {
    const summary = {
      queueLag: SystemState.metrics.queueLag,
      drift: SystemState.metrics.drift,
      webhookIngestCount: this.metrics.webhookIngestRate,
      duplicates: this.metrics.duplicateRejections,
      rollbacks: this.metrics.rollbacks,
      apiAvailability: this.metrics.apiAvailability,
      averageLatencies: {}
    };

    for (const [provider, samples] of Object.entries(this.metrics.providerLatencies)) {
      if (samples.length === 0) continue;
      const sum = samples.reduce((a, b) => a + b, 0);
      summary.averageLatencies[provider] = sum / samples.length;
    }

    return summary;
  }
}

module.exports = new HealthMonitorService();
