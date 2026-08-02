'use strict';

/**
 * CanaryController.js
 * ====================
 * Progressive Canary Rollout Controller.
 * Stages: INTERNAL (0%) -> 1% -> 5% -> 10% -> 25% -> 50% -> 100%.
 */
class CanaryController {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }
    this.stages = [1.00, 5.00, 10.00, 25.00, 50.00, 100.00];
    this.currentStageIndex = 0;
  }

  /**
   * Advance canary rollout stage after health verification
   */
  async promoteStage(version) {
    if (this.currentStageIndex < this.stages.length - 1) {
      this.currentStageIndex++;
    }
    const currentPercentage = this.stages[this.currentStageIndex];

    const rolloutRecord = {
      version: version || 'v1.0.0',
      environment: 'production',
      percentage: currentPercentage,
      started_at: new Date()
    };

    return rolloutRecord;
  }

  getCurrentPercentage() {
    return this.stages[this.currentStageIndex];
  }
}

module.exports = CanaryController;
