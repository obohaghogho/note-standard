const express = require('express');
const router = express.Router();

/**
 * App Version Control Endpoint
 * Returns the latest required app version and whether a force update is needed.
 * No auth required — must be accessible to all clients including outdated ones.
 */
const APP_CONFIG = {
  latest_version: '1.1.9',
  minimum_version: '1.1.9',
  force_update: true,
  update_message: 'Important update: Fixed in-room chat notifications, call connection timing, missed-call alerts, and duplicate notification toasts.',
  changelog: [
    'Fixed: Chat room notifications no longer appear when user is already in the conversation',
    'Fixed: Web push notifications suppressed when conversation is actively open',
    'Fixed: Audio/video call now correctly waits for ICE negotiation before showing connected state',
    'Fixed: Missed call toast shown when caller hangs up before answer',
    'Fixed: Voice calls no longer show empty video PiP box',
    'Fixed: Remote stream correctly re-binds on stream replacement during calls',
    'Fixed: Duplicate notification toasts eliminated (was firing twice per event)',
    'Fixed: Service worker correctly marks messages as read when chat is open'
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
