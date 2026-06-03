const express = require('express');
const router = express.Router();

/**
 * App Version Control Endpoint
 * Returns the latest required app version and whether a force update is needed.
 * No auth required — must be accessible to all clients including outdated ones.
 */
const APP_CONFIG = {
  latest_version: '1.6.1',
  minimum_version: '1.6.1',
  force_update: true,
  update_message: 'Critical UI Update: Completely overhauled web mobile keyboard synchronization to match native app speed.',
  changelog: [
    'Fixed: Web mobile keyboard delay by natively syncing layout to the Android VirtualKeyboard API at 60fps.'
  ]
};

router.get('/check', (req, res) => {
  const clientVersion = req.query.v || '0.0.0';
  
  const isOutdated = compareVersions(clientVersion, APP_CONFIG.minimum_version) < 0;
  const isLatest = compareVersions(clientVersion, APP_CONFIG.latest_version) >= 0;

  res.json({
    latest_version: APP_CONFIG.latest_version,
    minimum_version: APP_CONFIG.minimum_version,
    force_update: isOutdated,
    update_available: !isLatest,
    update_message: !isLatest ? APP_CONFIG.update_message : null,
    changelog: !isLatest ? APP_CONFIG.changelog : []
  });
});

/**
 * Compare two semver strings.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

module.exports = router;
