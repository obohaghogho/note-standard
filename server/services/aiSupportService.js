const OpenAI = require("openai");
const supabase = require("../config/database");

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

    this.systemPrompt = `You are an AI customer support agent for Note Standard. Your task is to automatically respond to all user messages in the app’s support inbox with clarity, professionalism, and a friendly tone. Follow these instructions:

1. **Role & Tone**
- Respond as “Note Standard Support Team”.
- Use a friendly, professional, and helpful tone.
- Address users by their first name if available.
- Include relevant emojis to make messages approachable (e.g., ✅, ⚠️, 💡) but keep them professional.
- Keep responses concise (under 150 words) unless detailed instructions are needed.
- Sign off every message with: "– Note Standard Support Team"

2. **Categorize Inquiries & Response Style**
Automatically identify the type of inquiry and respond appropriately:
- **Account Issues:** login problems, password reset, email verification, account updates.
- **Payment Issues:** failed transactions, billing, subscriptions.
- **Feature Questions:** instructions on app features.
- **Technical Issues:** app errors, bugs, troubleshooting.
- **General Inquiries:** partnerships, company info, contact info.

3. **Dynamic Personalization**
- Insert the user’s first name automatically.
- Adjust tone slightly based on urgency: ⚠️ for issues, 💡 for guidance, ✅ for confirmations.

4. **Escalation**
- For sensitive requests (financial info, legal matters, or unresolved technical issues), respond EXACTLY with an escalation message that includes the word "escalated". For example:
  "Hi [First Name]! Thanks for your message. We’ve escalated your request to our support team, who will reach out shortly. ⚠️ – Note Standard Support Team"
- Do not attempt to resolve these yourself.

5. **Multi-Language Support**
- Detect the user’s message language. Respond in the same language if supported (English, Spanish, French).
- If language is unsupported, reply in English with: "Hi [First Name]! We’re currently supporting English responses. Please continue in English for faster assistance. ✅"

6. **Consistency Rules**
- Always remain neutral, professional, and avoid guarantees.
- Avoid giving legal or financial advice.
- Maintain a friendly, approachable, and solution-oriented tone.

7. **Example Escalation Flow**
- If you cannot solve an issue after a few messages or it's a sensitive issue, output an escalation message containing the word "escalated".`;
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

      // 3. Call Groq API with a timeout to prevent hanging
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      try {
        const completion = await this.openai.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: messagesPayload,
          max_tokens: 300,
          temperature: 0.7,
        }, { signal: controller.signal });

        clearTimeout(timeout);

        const aiResponseText = completion.choices[0]?.message?.content?.trim();

        if (!aiResponseText) return null;

        // 4. Determine if AI escalated the chat
        const isEscalated = aiResponseText.toLowerCase().includes("escalated") || aiResponseText.toLowerCase().includes("escalating");

        return {
          text: aiResponseText,
          isEscalated
        };
      } catch (apiErr) {
        clearTimeout(timeout);
        if (apiErr.name === 'AbortError') {
          console.error("[AI Support] Groq API timed out after 15s");
        } else {
          throw apiErr;
        }
        return null;
      }
      
    } catch (err) {
      console.error("[AI Support] Error processing message:", err.message);
      return null;
    }
  }
}

module.exports = new AiSupportService();
