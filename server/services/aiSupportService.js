const OpenAI = require("openai");
const supabase = require("../config/database");
const fs = require("fs");
const path = require("path");

class KnowledgeManager {
  constructor(knowledgeDir) {
    this.knowledgeDir = knowledgeDir;
    this.cache = new Map();
    this.version = Date.now().toString();
    this.loadKnowledge();
    
    if (fs.existsSync(this.knowledgeDir)) {
      fs.watch(this.knowledgeDir, (eventType, filename) => {
        if (filename && filename.endsWith('.json')) {
          console.log(`[KnowledgeManager] Detected change in ${filename}, reloading...`);
          this.loadKnowledge();
        }
      });
    }
  }

  loadKnowledge() {
    this.cache.clear();
    try {
      const files = fs.readdirSync(this.knowledgeDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.knowledgeDir, file), 'utf8'));
          this.cache.set(file, data);
        } catch (e) {
          console.warn(`[KnowledgeManager] Failed to parse ${file}:`, e.message);
        }
      }
      this.version = Date.now().toString();
      console.log(`[KnowledgeManager] Loaded ${this.cache.size} knowledge files (v${this.version})`);
    } catch(err) {
      console.warn('[KnowledgeManager] Failed to read directory:', err.message);
    }
  }
  
  getKnowledgeFiles() {
    return Array.from(this.cache.entries());
  }
}

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

    const systemPromptPath = path.join(__dirname, '../prompts/support-system-prompt.md');
    const policyPath = path.join(__dirname, '../prompts/support-policy.md');
    this.systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
    this.supportPolicy = fs.readFileSync(policyPath, 'utf8');
    
    this.knowledgeDir = path.join(__dirname, '../knowledge');
    this.knowledgeManager = new KnowledgeManager(this.knowledgeDir);
  }

  isConfigured() {
    return this.openai !== null;
  }
  
  retrieveKnowledge(query) {
     const entries = this.knowledgeManager.getKnowledgeFiles();
     let matchedArticles = [];
     let knowledgeSnippets = [];
     
     const queryLower = query.toLowerCase();
     
     const categoryKeywords = {
         wallet: ['wallet', 'transfer', 'deposit', 'withdraw', 'cash', 'money', 'payout', 'pending', 'fee', 'fiat', 'bank', 'purchase', 'buy', 'fund', 'add', 'credit', 'virtual', 'account', 'balance', 'limit', 'settle', 'cross', 'currency', 'ngn', 'usd', 'eur', 'gbp', 'aud', 'cad', 'zar', 'jpy', 'nzd', 'paystack', 'fincra', 'anchor'],
         messaging: ['message', 'tick', 'notification', 'chat', 'receipt', 'read', 'push', 'call', 'video', 'audio', 'voice', 'media', 'attachment', 'reaction', 'disappearing'],
         crypto: ['crypto', 'swap', 'network', 'chain', 'coin', 'token', 'usdt', 'btc', 'eth', 'memo', 'tag', 'nowpayments', 'trc20', 'erc20', 'bitcoin'],
         authentication: ['auth', 'login', 'password', 'verify', 'verification', '2fa', 'otp', 'sign', 'kyc', 'bvn', 'nin', 'tier', 'session', 'pin'],
         workspace: ['workspace', 'trend', 'note', 'folder', 'tag', 'export', 'summary', 'ai', 'editor', 'community'],
         teams: ['team', 'member', 'invite', 'role', 'permission', 'owner', 'guest', 'organization', 'collaborate'],
         monetization: ['monetization', 'subscription', 'pro', 'plan', 'billing', 'upgrade', 'pricing', 'affiliate', 'referral', 'commission', 'ad', 'advertisement', 'banner', 'paid'],
         settings: ['setting', 'settings', 'profile', 'avatar', 'theme', 'dark', 'light', 'wallpaper', 'ad', 'advertisement', 'privacy', 'pwa', 'install', 'language'],
         support: ['support', 'ticket', 'agent', 'help', 'contact', 'hours', 'issue', 'problem', 'escalate', 'human', 'session', 'close'],
         troubleshooting: ['troubleshoot', 'error', 'fail', 'failed', 'slow', 'broken', 'load', 'bug', 'fix', 'app', 'freeze', 'blank', 'disconnect', 'permission', 'push']
     };

     let allIntents = [];

     for (const [file, data] of entries) {
         const feature = (data.feature || "").toLowerCase();
         let baseCategoryScore = 0;
         
         const keywords = categoryKeywords[feature] || [];
         for (const kw of keywords) {
             if (queryLower.includes(kw)) baseCategoryScore += 2;
         }

         for (const intent of data.intents || []) {
             let score = baseCategoryScore;
             const intentKw = intent.name.replace(/_/g, ' ').toLowerCase();
             
             const words = intentKw.split(' ');
             for (const word of words) {
                 const stem = word.replace(/s$/, '');
                 if (word.length > 2 && (queryLower.includes(word) || (stem.length > 2 && queryLower.includes(stem)))) {
                     score += 4;
                 }
             }

             if (intent.keywords && Array.isArray(intent.keywords)) {
                 for (const kw of intent.keywords) {
                     if (kw && queryLower.includes(kw.toLowerCase())) score += 3;
                 }
             }
             
             allIntents.push({
                 article_id: intent.article_id || `${feature}.${intent.name}`,
                 feature,
                 score,
                 intentData: intent
             });
         }
     }

     allIntents.sort((a, b) => b.score - a.score);
     const topIntents = allIntents.filter(i => i.score > 0).slice(0, 3);
     
     if (topIntents.length > 0) {
         matchedArticles = topIntents.map(i => i.article_id);
         knowledgeSnippets = topIntents.map(i => JSON.stringify(i.intentData));
     } else {
         console.log(JSON.stringify({
             event: "knowledge_miss",
             query: query,
             matched: false,
             category: null,
             timestamp: new Date().toISOString()
         }));
     }
     
     return {
         knowledge_version: this.knowledgeManager.version,
         sources_used: matchedArticles,
         content: knowledgeSnippets.join("\n\n")
     };
  }
  
  validateResponse(responseObj) {
      const text = (responseObj.response || "").toLowerCase();
      
      const violations = [
          "refund",
          "engineering has fixed",
          "engineering has been notified"
      ];
      
      for (const v of violations) {
          if (text.includes(v)) {
              console.warn(`[AI Support] Validation violation caught for rule: ${v}`);
              return false;
          }
      }
      return true;
  }

  async processSupportMessage(conversationId, userMessage, userId, botSenderId) {
    if (!this.isConfigured()) return null;
    const startTimeMs = Date.now();

    // Check for user close/resolution intent keywords
    const lowerMsg = (userMessage || "").trim().toLowerCase();
    const closeTriggers = [
        "close chat", "close support", "close this chat", "no further questions", 
        "thanks, close", "close it", "no more questions", "i am done", 
        "problem solved", "issue resolved"
    ];

    const exactSingleWordTriggers = ["close", "done", "resolved"];

    const isCloseTrigger = exactSingleWordTriggers.includes(lowerMsg) || 
      closeTriggers.some(trigger => lowerMsg === trigger || lowerMsg.includes(trigger));

    if (isCloseTrigger) {
        const idempotencyKey = `ai_close_${conversationId}`;
        
        // Idempotency Check: Has a closing message already been sent for this conversation?
        const { data: existingClosingMsg } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .ilike("content", "%resolved and closed%")
            .limit(1)
            .maybeSingle();

        if (existingClosingMsg) {
            console.log(`[AI Diagnostic] trigger: close_chat | convId: ${conversationId} | idempotencyKey: ${idempotencyKey} | status: SKIPPED_DUPLICATE`);
            return null;
        }

        console.log(`[AI Diagnostic] trigger: close_chat | convId: ${conversationId} | idempotencyKey: ${idempotencyKey} | status: GENERATED`);

        // Automatically resolve conversation status
        await supabase
            .from("conversations")
            .update({ support_status: "resolved", updated_at: new Date().toISOString() })
            .eq("id", conversationId);

        return {
            text: "This support chat session has been resolved and closed. ✅ Whenever you reach out to our support team again, your previous messages will be wiped clean so you start with a fresh new session! Have a great day!",
            isEscalated: false,
            operationalMetadata: {
                intent: "close_chat",
                category: "support",
                confidence: 1.0,
                idempotency_key: idempotencyKey
            }
        };
    }

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", userId)
        .single();
      
      const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : (profile?.username || 'User');

      const { data: recentMessages, error } = await supabase
        .from("messages")
        .select("content, sender_id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(6);

      let chatHistory = [];
      if (!error && recentMessages) {
        chatHistory = recentMessages.reverse().map(msg => ({
          role: msg.sender_id === botSenderId ? "assistant" : "user",
          content: msg.content
        }));
      }

      if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].content !== userMessage) {
         chatHistory.push({ role: "user", content: userMessage });
      }
      
      const retrieval = this.retrieveKnowledge(userMessage);

      const messagesPayload = [
        { role: "system", content: `${this.systemPrompt}\n\n${this.supportPolicy}\n\n# RETRIEVED PRODUCT KNOWLEDGE (Version: ${retrieval.knowledge_version})\n${retrieval.content || "No matching knowledge found."}\n\nThe user's first name is: ${firstName}` },
        ...chatHistory
      ];

      console.log(`[AI] Sending request to Groq...`);
      console.log(`Model: llama-3.3-70b-versatile`);
      console.log(`Conversation ID: ${conversationId}`);
      console.log(`User ID: ${userId}`);
      console.log(`Prompt length: ${messagesPayload[0].content.length} chars`);
      console.log(`History messages: ${chatHistory.length}`);

      const modelsToTry = [
        "llama-3.3-70b-versatile",
        process.env.GROQ_MODEL || "openai/gpt-oss-20b"
      ];

      let completion = null;
      let lastError = null;
      let modelUsed = "";

      for (const model of modelsToTry) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
          completion = await this.openai.chat.completions.create({
            model,
            messages: messagesPayload,
            max_tokens: 600,
            temperature: 0.2,
            response_format: { type: "json_object" }
          }, { signal: controller.signal });

          clearTimeout(timeout);
          if (completion?.choices[0]?.message?.content) {
              modelUsed = model;
              break;
          }
        } catch (apiErr) {
          clearTimeout(timeout);
          lastError = apiErr;
          console.warn(`[AI Support] Model ${model} failed, trying next:`, apiErr.message);
        }
      }

      if (!completion) {
        console.error("[AI] Groq Request Failed");
        console.error(`HTTP Status: Error`);
        console.error(`Latency: ${Date.now() - startTimeMs}ms`);
        console.error(`Error: ${lastError?.message}`);
        console.error(`Fallback Used: true`);
        if (lastError) throw lastError;
        return null;
      }
      
      const latency = Date.now() - startTimeMs;
      const tokens = completion.usage?.total_tokens || 0;
      const aiResponseText = completion.choices[0]?.message?.content?.trim();
      
      console.log(`[AI] Groq response received`);
      console.log(`tokens: ${tokens}`);
      console.log(`latency: ${latency}ms`);
      console.log(`content: ${aiResponseText}`);

      if (!aiResponseText) return null;
      
      let parsedResponse;
      try {
          parsedResponse = JSON.parse(aiResponseText);
      } catch (parseErr) {
          console.error("[AI Support] Failed to parse JSON response:", parseErr.message);
          return null;
      }
      
      let calculatedConfidence = parsedResponse.confidence !== undefined ? parsedResponse.confidence : 0.95;
      if (retrieval.sources_used.length === 0) {
          calculatedConfidence = 0.20;
      }
      
      let isEscalated = parsedResponse.escalate === true || calculatedConfidence < 0.80;
      
      if (!isEscalated && !this.validateResponse(parsedResponse)) {
          isEscalated = true;
      }
      
      if (isEscalated) {
          parsedResponse.response = "I don't have enough information to answer that accurately. I'll connect this conversation to the support team.";
      }

      const responseId = 'ai_resp_' + require('crypto').randomUUID().replace(/-/g, '').substring(0, 16);

      const aiDebugMetadata = {
          response_id: responseId,
          model: modelUsed,
          latency: latency,
          knowledge_used: retrieval.content ? true : false,
          articles_used: retrieval.sources_used,
          token_usage: tokens,
          knowledge_version: retrieval.knowledge_version,
          prompt_version: "v2_enterprise"
      };

      const operationalMetadata = {
          category: parsedResponse.category || "Unknown",
          intent: parsedResponse.intent || "Unknown",
          priority: parsedResponse.priority || "normal",
          confidence: calculatedConfidence,
          customer_problem: userMessage,
          actions_tried: parsedResponse.actions_tried || "",
          recommended_next_step: parsedResponse.recommended_next_step || (isEscalated ? "Review chat history and respond manually" : "None")
      };

      console.log("[AI Support] Analytics Record:", JSON.stringify({...operationalMetadata, ...aiDebugMetadata}));

      return {
        text: parsedResponse.response,
        isEscalated,
        operationalMetadata,
        aiDebugMetadata
      };
      
    } catch (err) {
      console.error("[AI Support] Error processing message:", err.message);
      return null;
    }
  }
}

module.exports = new AiSupportService();
