function generateScenario(level, conversationId) {
  const base = {
    conversationId,
    devices: 1,
    queueDepth: 5,
    network: { jitter: 100, dropRate: 0.01 }
  };

  switch (level) {
    case 1:
      return base;

    case 2:
      return {
        ...base,
        devices: 2,
        queueDepth: 30,
        network: { jitter: 600, dropRate: 0.1 }
      };

    case 3:
      return {
        ...base,
        devices: 5,
        queueDepth: 200,
        network: { jitter: 1200, dropRate: 0.25, duplicateRate: 0.2 }
      };

    default:
      throw new Error("Invalid chaos level");
  }
}

module.exports = { generateScenario };
