const { forceTakeoverLease } = require("../../../rpc/sessionArbitration");

module.exports = {
  name: "leaseViolationFix",

  async execute(anomaly, context) {
    try {
      // Re-assert the lease for the valid device context
      await forceTakeoverLease({
        conversationId: anomaly.conversation_id,
        sessionId: context.sessionId || `recovery-session-${Date.now()}`,
        deviceId: context.device_id || anomaly.device_id
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};
