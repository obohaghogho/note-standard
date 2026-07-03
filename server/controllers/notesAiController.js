const Groq = require("groq-sdk");
const logger = require("../utils/logger");
const pool = require("../config/pgPool");

let groq;
try {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} catch (err) {
  logger.warn("[NotesAiController] Groq SDK initialization failed (missing key?):", err.message);
}

const AI_PROMPTS = {
  summarize: "Provide a concise summary of the following note content, highlighting key points and main ideas.",
  rewrite: "Rewrite the following note content to improve clarity, flow, and professional readability while preserving all original meanings.",
  grammar: "Proofread the following note content. Correct all spelling, grammar, and punctuation mistakes. Return only the corrected text.",
  expand: "Elaborate and expand upon the following note content, adding relevant details, logical structure, and explanations.",
  checklist: "Generate a clean, actionable task checklist based on the topics discussed in this note. Use markdown checkbox lists `- [ ]`.",
  actions: "Extract clear, actionable next steps, tasks, and responsibilities from the following note content.",
  "meeting-summary": "Generate a professional meeting summary from the following text, including key discussions, decisions made, and next actions.",
  "title-generation": "Analyze the following note content and suggest 5 short, descriptive titles. Return them as a clean bulleted list.",
  "tag-suggestions": "Analyze the following note content and suggest 5-8 relevant tags. Return them as a comma-separated list of hashtag keywords, like #work, #ideas."
};

const handleAiAssist = async (req, res) => {
  const startTime = Date.now();
  try {
    const { id: userId } = req.user;
    const { noteId, content, actionType, targetLanguage, promptOverride } = req.body;

    if (!groq) {
      return res.status(503).json({ error: "AI service is currently unavailable. Groq API key is not configured." });
    }

    if (!actionType) {
      return res.status(400).json({ error: "actionType is required." });
    }

    // 1. Resolve note content if ID is provided but content is empty
    let noteContent = content || "";
    let noteTitle = "Note Context";
    if (noteId && !noteContent) {
      const { rows } = await pool.query(
        "SELECT title, content FROM notes WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL LIMIT 1",
        [noteId, userId]
      );
      if (rows.length > 0) {
        noteContent = rows[0].content || "";
        noteTitle = rows[0].title || "Untitled Note";
      }
    }

    if (!noteContent.trim() && actionType !== "title-generation") {
      return res.status(400).json({ error: "Note content is empty. Please provide text for the AI to analyze." });
    }

    // 2. Build system instructions
    let instruction = AI_PROMPTS[actionType] || "Analyze the following note content.";
    if (actionType === "translate") {
      instruction = `Translate the following note content into ${targetLanguage || "Spanish"}. Maintain the original formatting and tone.`;
    }
    if (promptOverride) {
      instruction = promptOverride;
    }

    const messages = [
      {
        role: "system",
        content: `${instruction}\n\nRespond directly with the resulting output. Do not include introductory phrases like "Here is the summary:" or "Sure, I corrected it:". Just return the clean resulting note text.`
      },
      {
        role: "user",
        content: `Note Title: ${noteTitle}\nNote Content:\n${noteContent}`
      }
    ];

    // 3. Request Groq API completion
    const modelName = "llama-3.1-8b-instant";
    const completion = await groq.chat.completions.create({
      messages,
      model: modelName,
      temperature: 0.3,
      max_tokens: 1500
    });

    const aiResponse = completion.choices[0]?.message?.content ?? "I could not process that request.";
    const tokensUsed = completion.usage?.total_tokens || 0;
    const latency = Date.now() - startTime;
    // Llama-3.1 8b instant cost estimate: ~$0.0001 per 1000 tokens
    const estimatedCost = (tokensUsed / 1000) * 0.0001;

    // 4. Log generation in ai_generations table
    await pool.query(
      `INSERT INTO ai_generations 
        (user_id, note_id, prompt, response, action_type, model, provider, tokens_used, latency_ms, estimated_cost, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'groq', $7, $8, $9, 'success')`,
      [
        userId,
        noteId || null,
        instruction,
        aiResponse,
        actionType,
        modelName,
        tokensUsed,
        latency,
        estimatedCost
      ]
    );

    res.json({
      success: true,
      response: aiResponse,
      tokensUsed,
      latency_ms: latency,
      estimatedCost
    });

  } catch (err) {
    logger.error("[NotesAiController] AI Assist failed:", err.message);
    
    // Log failure in database for audit trail
    try {
      const { id: userId } = req.user;
      const { noteId, actionType } = req.body;
      const latency = Date.now() - startTime;
      await pool.query(
        `INSERT INTO ai_generations 
          (user_id, note_id, prompt, response, action_type, model, provider, tokens_used, latency_ms, estimated_cost, status) 
         VALUES ($1, $2, $3, $4, $5, $6, 'groq', 0, $7, 0, 'failed')`,
        [userId, noteId || null, "AI Assist request", err.message, actionType || "assist", "llama-3.1-8b-instant", latency]
      );
    } catch (dbErr) {
      logger.error("[NotesAiController] Failed to log failure:", dbErr.message);
    }

    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  handleAiAssist
};
