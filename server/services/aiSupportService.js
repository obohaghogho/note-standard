let OpenAI = null;
try { OpenAI = require("openai"); } catch (e) { console.warn("[AI Support] openai module optional load warning:", e.message); }
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
    if (process.env.GROQ_API_KEY && OpenAI) {
      this.openai = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      });
    } else {
      console.warn("[AI Support] GROQ_API_KEY not set or OpenAI package missing. Using Knowledge Base fallback mode.");
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
         workspace: ['workspace', 'trend', 'note', 'notes', 'folder', 'tag', 'export', 'summary', 'ai', 'editor', 'community'],
         teams: ['team', 'member', 'invite', 'role', 'permission', 'owner', 'guest', 'organization', 'collaborate'],
         monetization: ['monetization', 'subscription', 'pro', 'plan', 'billing', 'upgrade', 'pricing', 'affiliate', 'referral', 'commission', 'ad', 'advertisement', 'banner', 'paid'],
         settings: ['setting', 'settings', 'profile', 'avatar', 'theme', 'dark', 'light', 'wallpaper', 'privacy', 'pwa', 'install', 'language'],
         support: ['support', 'ticket', 'agent', 'help', 'contact', 'hours', 'issue', 'problem', 'escalate', 'human', 'session', 'close'],
         troubleshooting: ['troubleshoot', 'error', 'fail', 'failed', 'slow', 'broken', 'load', 'bug', 'freeze', 'blank', 'disconnect', 'permission']
     };

     let allIntents = [];

     for (const [file, data] of entries) {
         const feature = (data.feature || "").toLowerCase();
         let baseCategoryScore = 0;
         
         const keywords = categoryKeywords[feature] || [];
         for (const kw of keywords) {
             const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
             if (regex.test(queryLower)) baseCategoryScore += 3;
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
        
        try {
          const { data: existingClosingMsg, error: existingErr } = await supabase
              .from("messages")
              .select("id")
              .eq("conversation_id", conversationId)
              .ilike("content", "%resolved and closed%")
              .limit(1)
              .maybeSingle();

          if (!existingErr && existingClosingMsg && existingClosingMsg.id) {
              console.log(`[AI Diagnostic] trigger: close_chat | convId: ${conversationId} | idempotencyKey: ${idempotencyKey} | status: SKIPPED_DUPLICATE`);
              return null;
          }

          await supabase
              .from("conversations")
              .update({ support_status: "resolved", updated_at: new Date().toISOString() })
              .eq("id", conversationId);
        } catch (dbErr) {
          console.warn("[AI Diagnostic] DB check skipped during close trigger execution (non-fatal):", dbErr.message);
        }

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
        { role: "system", content: `${this.systemPrompt}\n\n${this.supportPolicy}\n\n# RETRIEVED PRODUCT KNOWLEDGE (Version: ${retrieval.knowledge_version})\n${retrieval.content || "No matching knowledge snippet found."}\n\nThe user's first name is: ${firstName}` },
        ...chatHistory
      ];

      const modelsToTry = [
        process.env.GROQ_MODEL,
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant"
      ].filter(Boolean);

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
        console.warn(`[AI Support] LLM API unconfigured or unavailable. Generating Knowledge Base fallback response for query: "${userMessage.substring(0, 40)}..."`);
        return this.generateKnowledgeFallbackResponse(userMessage, firstName, retrieval);
      }
      
      const latency = Date.now() - startTimeMs;
      const tokens = completion.usage?.total_tokens || 0;
      const aiResponseText = completion.choices[0]?.message?.content?.trim();
      
      if (!aiResponseText) {
        return this.generateKnowledgeFallbackResponse(userMessage, firstName, retrieval);
      }
      
      let parsedResponse;
      try {
          parsedResponse = JSON.parse(aiResponseText);
      } catch (parseErr) {
          console.error("[AI Support] Failed to parse JSON response:", parseErr.message);
          return this.generateKnowledgeFallbackResponse(userMessage, firstName, retrieval);
      }
      
      const explicitHumanRequest = /human|agent|specialist|operator|speak to human|talk to agent|escalate to agent/i.test(userMessage);
      let isEscalated = parsedResponse.escalate === true || explicitHumanRequest;
      let calculatedConfidence = parsedResponse.confidence !== undefined ? parsedResponse.confidence : 0.95;
      
      if (!isEscalated && !this.validateResponse(parsedResponse)) {
          isEscalated = true;
      }
      
      if (isEscalated) {
          parsedResponse.response = `Hi ${firstName}! 👋 I don't have enough information to solve that automatically, so I've assigned a human specialist agent to your request. A support team member will follow up shortly!`;
      }

      const responseId = 'ai_resp_' + require('crypto').randomUUID().replace(/-/g, '').substring(0, 16);

      const aiDebugMetadata = {
          response_id: responseId,
          model: modelUsed || 'kb-fallback',
          latency: latency,
          knowledge_used: retrieval.content ? true : false,
          articles_used: retrieval.sources_used,
          token_usage: tokens,
          knowledge_version: retrieval.knowledge_version,
          prompt_version: "v2_enterprise"
      };

      const operationalMetadata = {
          category: parsedResponse.category || "General",
          intent: parsedResponse.intent || "Support Request",
          priority: parsedResponse.priority || "normal",
          confidence: calculatedConfidence,
          customer_problem: userMessage,
          actions_tried: parsedResponse.actions_tried || "",
          recommended_next_step: parsedResponse.recommended_next_step || (isEscalated ? "Review chat history and respond manually" : "None")
      };

      return {
        text: parsedResponse.response,
        isEscalated,
        operationalMetadata,
        aiDebugMetadata
      };
      
    } catch (err) {
      console.error("[AI Support] Error processing message, using Knowledge fallback:", err.message);
      return this.generateKnowledgeFallbackResponse(userMessage, firstName, retrieval);
    }
  }

  /**
   * Generates a deterministic Knowledge Base fallback response when LLM APIs are offline or unconfigured.
   */
  generateKnowledgeFallbackResponse(userMessage, firstName = 'User', retrieval = { sources_used: [], content: '' }) {
    const isMatched = retrieval.sources_used && retrieval.sources_used.length > 0;
    const responseId = 'ai_resp_kb_' + require('crypto').randomUUID().replace(/-/g, '').substring(0, 16);
    
    let text = `Hi ${firstName}! 👋 Thank you for reaching out to NoteStandard Support. `;
    let isEscalated = false;

    if (isMatched) {
      text += `Here is what our knowledge base recommends for your query:\n\n`;
      try {
        const rawSnippets = retrieval.content ? retrieval.content.split('\n\n') : [];
        let addedAnswers = [];
        for (const raw of rawSnippets) {
          try {
            const parsed = JSON.parse(raw);
            const ans = parsed.answer || parsed.solution || parsed.summary || parsed.description;
            if (ans) addedAnswers.push(`• ${ans}`);
          } catch {}
        }
        if (addedAnswers.length > 0) {
          text += addedAnswers.join('\n\n');
        } else {
          text += `You can manage notes in the Workspace tab (+ button), view balances and make transactions in the Wallet tab, or adjust settings in Settings. Reply to this message if you need further details!`;
        }
      } catch (e) {
        text += `Please check your dashboard or settings. Reply to this message if you need further assistance!`;
      }
    } else {
      const explicitHuman = /human|agent|specialist|operator|speak to human|talk to agent/i.test(userMessage);
      if (explicitHuman) {
        isEscalated = true;
        text += `I've assigned a human specialist agent to your request. A support team member will follow up shortly!`;
      } else {
        isEscalated = false;
        text += `NoteStandard provides a multi-currency wallet, real-time messaging with voice/video calls, team workspaces, notes editor with AI assistance, and social community feed.\n\nYou can create new notes in the Workspace tab (+ button), send messages or start calls in Chat, manage funds in Wallet, and manage projects in Teams. Feel free to ask any specific question!`;
      }
    }

    return {
      text,
      isEscalated,
      operationalMetadata: {
        category: "General",
        intent: "Support Request",
        priority: isEscalated ? "high" : "normal",
        confidence: isMatched ? 0.85 : 0.60,
        customer_problem: userMessage,
        recommended_next_step: "Review chat history"
      },
      aiDebugMetadata: {
        response_id: responseId,
        model: "knowledge-base-engine",
        latency: 5,
        knowledge_used: isMatched,
        articles_used: retrieval.sources_used || [],
        token_usage: 0,
        knowledge_version: retrieval.knowledge_version || "1.0",
        prompt_version: "v2_fallback"
      }
    };
  }
}

module.exports = new AiSupportService();
