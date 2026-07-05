const crypto = require("crypto");

function sortObjectKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj && typeof obj === "object") {
    return Object.keys(obj).sort().reduce((acc, key) => {
      acc[key] = sortObjectKeys(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

function hashTimeline(events) {
  const normalized = events
    .map(e => JSON.stringify(sortObjectKeys(e)))
    .join("|");

  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex");
}

module.exports = { hashTimeline };
