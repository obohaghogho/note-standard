const express = require("express");
const { certifyRun } = require("./certificationRunner");

const router = express.Router();

router.post("/certify", async (req, res) => {
  try {
      const { events } = req.body;

      if (!events || !Array.isArray(events)) {
          return res.status(400).json({ success: false, error: "Invalid events payload" });
      }

      const certificate = await certifyRun(events);

      res.json({
        success: true,
        certificate
      });
  } catch (err) {
      res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
