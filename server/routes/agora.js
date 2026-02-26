const express = require("express");
const router = express.Router();
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const logger = require("../utils/logger");

/**
 * @route GET /api/agora/token
 * @desc Generate Agora RTC token for a channel
 */
router.get("/token", (req, res) => {
  try {
    const { channelName, uid } = req.query;

    if (!channelName) {
      return res.status(400).json({ error: "channelName is required" });
    }

    // Agora UID must be a number for buildTokenWithUid
    // If it's a string (like Supabase UUID), we should use buildTokenWithAccount
    // or ensure the client uses numeric UIDs.
    // Defaulting to 0 lets Agora assign one if not provided.
    const agoraUid = uid ? parseInt(uid) : 0;

    const appID = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appID || !appCertificate) {
      logger.error("Agora credentials missing in environment variables");
      return res.status(500).json({
        error: "Agora server configuration missing",
      });
    }

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appID,
      appCertificate,
      channelName,
      agoraUid,
      role,
      privilegeExpiredTs,
    );

    res.json({ token, uid: agoraUid });
  } catch (error) {
    logger.error("Error generating Agora token:", error.message);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

module.exports = router;
