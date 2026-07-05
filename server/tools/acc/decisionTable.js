function decide(risk) {
  if (risk >= 0.85) {
    return "DELAY"; // wait for lease stabilization
  }

  if (risk >= 0.55) {
    return "TRANSFORM"; // auto lease takeover
  }

  return "ALLOW";
}

module.exports = { decide };
