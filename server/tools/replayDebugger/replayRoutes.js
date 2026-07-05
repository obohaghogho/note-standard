const express = require("express");
const router = express.Router();

const { runReplay } = require("./replayEngine");

router.get("/api/debug/replay/:conversationId", async (req, res) => {
    try {
        const { conversationId } = req.params;

        const result = await runReplay({
            conversationId
        });

        res.json(result);

    } catch (err) {
        console.error("Replay error:", err);
        res.status(500).json({
            error: "REPLAY_ENGINE_FAILURE"
        });
    }
});

module.exports = router;
