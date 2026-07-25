const OpenAI = require("openai");
const supabase = require("../config/database");
const fs = require("fs");
const path = require("path");

class AiSupportService {
  constructor() {
    this.openai = null;
    if (process.env.GROQ_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      });
    } else {
      console.warn("[AI Support] GROQ_API_KEY not set. AI support agent will be disabled.");
    }

    const promptPath = path.join(__dirname, '../prompts/support-system-prompt.md');
    this.systemPrompt = fs.readFileSync(promptPath, 'utf8');
  }

  isConfigured() {
    return this.openai !== null;
  }

  async processSupportMessage(conversationId, userMessage, userId, botSenderId) {
    if (!this.isConfigured()) return null;

    try {
      // 1. Fetch user profile for First Name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", userId)
        .single();
      
      const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : (profile?.username || 'User');

      // 2. Fetch the last 6 messages in this conversation for context
      const { data: recentMessages, error } = await supabase
        .from("messages")
        .select("content, sender_id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(6);

      let chatHistory = [];
      if (!error && recentMessages) {
        // Reverse to get chronological order – use the actual botSenderId to identify AI messages
        chatHistory = recentMessages.reverse().map(msg => ({
          role: msg.sender_id === botSenderId ? "assistant" : "user",
          content: msg.content
        }));
      }

      // Check if the user's current message is already in context (it might be since we insert before calling this)
      // If not, append it.
      if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].content !== userMessage) {
         chatHistory.push({ role: "user", content: userMessage });
      }

      const messagesPayload = [
        { role: "system", content: `${this.systemPrompt}\n\nThe user's first name is: ${firstName}` },
        ...chatHistory
      ];

      // 3. Call Groq API with fallback models and a 15s timeout
      const modelsToTry = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768",
      ];

      let completion = null;
      let lastError = null;

      for (const model of modelsToTry) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

        try {
          completion = await this.openai.chat.completions.create({
            model,
            messages: messagesPayload,
            max_tokens: 500,
            temperature: 0.6,
          }, { signal: controller.signal });

          clearTimeout(timeout);
          if (completion?.choices[0]?.message?.content) break;
        } catch (apiErr) {
          clearTimeout(timeout);
          lastError = apiErr;
          console.warn(`[AI Support] Model ${model} failed, trying next:`, apiErr.message);
        }
      }

      if (!completion) {
        if (lastError) throw lastError;
        return null;
      }

      const aiResponseText = completion.choices[0]?.message?.content?.trim();
      if (!aiResponseText) return null;

      // 4. Determine if AI escalated the chat
      const isEscalated = aiResponseText.toLowerCase().includes("escalated") || aiResponseText.toLowerCase().includes("escalating");

      return {
        text: aiResponseText,
        isEscalated
      };
      
    } catch (err) {
      console.error("[AI Support] Error processing message:", err.message);
      return null;
    }
  }
}

module.exports = new AiSupportService();
