/**
 * SupportService — Centralized AI Support Escalation & Ticket Management
 *
 * Architecture Responsibilities:
 * 1. AI Decision & Prompt Processing
 * 2. Intent-Driven Automatic Priority Matrix
 * 3. DB Transaction Execution (via Supabase RPC)
 * 4. Optimistic Claim Locking with TTL Expiration
 * 5. WebSocket Realtime Emission (strictly AFTER DB commit)
 * 6. Structured Step-by-Step Logging & Operational Metrics
 */

const supabase = require("../config/database");
const aiSupportService = require("./aiSupportService");
const realtime = require("./realtimeService");
const logger = require("../utils/logger");
const notificationService = require("./notificationService");

class SupportService {
  constructor() {
    this.metrics = {
      ai_queries_total: 0,
      ai_success_count: 0,
      ai_escalation_count: 0,
      ai_timeout_count: 0,
      rpc_failures: 0,
    };
  }

  /**
   * Intent-Driven Automatic Priority Matrix
   */
  calculatePriority(intent = "", category = "", userMessage = "", userPlan = "free") {
    const planService = require("./planService");
    const planConfig = planService.getPlanConfig(userPlan);
    const priorityFloor = planConfig.supportPriorityFloor || "low";

    const text = `${intent} ${category} ${userMessage}`.toLowerCase();
    
    const urgentKeywords = ["fraud", "hacked", "stolen", "unauthorized", "suspicious", "drain"];
    const highKeywords = ["failed", "freeze", "frozen", "locked", "withdrawal", "deposit", "money", "fiat", "bank", "error", "emergency"];
    const lowKeywords = ["feedback", "suggestion", "ui", "font", "theme", "color"];

    const PRIORITY_ORDER = { low: 1, normal: 2, high: 3, urgent: 4 };

    let keywordPriority = "normal";
    for (const kw of urgentKeywords) {
      if (text.includes(kw)) { keywordPriority = "urgent"; break; }
    }
    if (keywordPriority !== "urgent") {
      for (const kw of highKeywords) {
        if (text.includes(kw)) { keywordPriority = "high"; break; }
      }
    }
    if (keywordPriority === "normal") {
      for (const kw of lowKeywords) {
        if (text.includes(kw)) { keywordPriority = "low"; break; }
      }
    }

    return (PRIORITY_ORDER[keywordPriority] || 2) > (PRIORITY_ORDER[priorityFloor] || 1)
      ? keywordPriority
      : priorityFloor;
  }

  /**
   * Helper to resolve a distinct system bot / support admin ID for AI responses.
   */
  /**
   * Helper to resolve a distinct system bot / support admin ID for AI responses.
   * MUST ALWAYS return a dedicated bot ID and NEVER return an actual human admin user ID.
   */
  async getBotSenderId(excludeUserId) {
    const DEDICATED_BOT_ID = "00000000-0000-0000-0000-000000000000";
    try {
      const { createClient } = require('@supabase/supabase-js');
      const env = require('../config/env');
      const serviceSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

      // 1. Look for dedicated support bot profile
      const { data: botProfile } = await serviceSupabase
        .from("profiles")
        .select("id")
        .or("username.eq.support_bot,username.eq.support_ai,role.eq.bot,id.eq.00000000-0000-0000-0000-000000000000")
        .limit(1)
        .maybeSingle();

      if (botProfile && botProfile.id !== excludeUserId) return botProfile.id;
    } catch (e) {
      logger.warn(`[SupportService] Error finding botSenderId: ${e.message}`);
    }
    return DEDICATED_BOT_ID;
  }

  /**
   * Process a message sent in a support chat.
   * Handles AI auto-reply, policy check, escalation, DB transaction, and realtime notification.
   */
  async handleUserSupportMessage(conversationId, content, userId, botSenderId) {
    this.metrics.ai_queries_total++;
    const t0 = Date.now();

    if (!botSenderId || botSenderId === userId) {
      botSenderId = await this.getBotSenderId(userId);
    }

    // Check conversation session state. Re-open session if previously resolved/closed.
    const { data: convInfo } = await supabase
      .from("conversations")
      .select("support_status")
      .eq("id", conversationId)
      .maybeSingle();

    if (convInfo?.support_status === "resolved" || convInfo?.support_status === "closed") {
      logger.info(`[SupportService] Reopening resolved support session: ${conversationId}`);
      await supabase
        .from("conversations")
        .update({ support_status: "open", updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      await realtime.emitToConversation(conversationId, "chat:conversation_updated", {
        id: conversationId,
        support_status: "open"
      });
    }

    // ── STEP 1: AI Decision & Evaluation ──────────────────────────────────────
    logger.info(`[Escalation:Step1_AiDecision] Processing message for conv ${conversationId}`, {
      conversationId,
      userId,
      messageLength: content ? content.length : 0
    });

    let aiResponse = null;
    let escalationReason = "AI_CONFIDENCE_LOW";

    try {
      if (aiSupportService.isConfigured()) {
        aiResponse = await aiSupportService.processSupportMessage(conversationId, content, userId, botSenderId);
        if (!aiResponse) {
          logger.info(`[AI Diagnostic] trigger: user_message | convId: ${conversationId} | status: SKIPPED_DUPLICATE_OR_EMPTY`);
          return { isEscalated: false, skipped: true };
        }
      } else {
        escalationReason = "API_FAILURE";
      }
    } catch (aiErr) {
      logger.error(`[Escalation:Step1_AiDecision] AI Processing Exception: ${aiErr.message}`, {
        conversationId,
        error: aiErr.message
      });
      this.metrics.ai_timeout_count++;
      escalationReason = "AI_TIMEOUT";
    }

    // Determine final escalation state
    let isEscalated = false;
    let botMessageText = "";

    if (!aiResponse) {
      isEscalated = true;
      botMessageText = "Hi there! 👋 Our support agent has been notified and will assist you shortly. – Note Standard Support Team";
    } else {
      isEscalated = aiResponse.isEscalated;
      botMessageText = aiResponse.text || "I'll transfer this conversation to our human support team.";
      if (aiResponse.operationalMetadata?.escalation_reason) {
        escalationReason = aiResponse.operationalMetadata.escalation_reason;
      }
    }

    if (!isEscalated) {
      // ── NORMAL AI RESPONSE (NO ESCALATION) ───────────────────────────────────
      this.metrics.ai_success_count++;
      
      const { data: rpcData, error: autoErr } = await supabase.rpc('rpc_send_message', {
        p_conversation_id: conversationId,
        p_sender_id: botSenderId,
        p_content: botMessageText,
        p_type: "text",
        p_event_id: require("crypto").randomUUID(),
        p_original_language: "en",
        p_attachment_id: null,
        p_reply_to_id: null
      });

      let autoMsg = rpcData?.message;
      if (autoErr || !autoMsg) {
        // Fallback insert if RPC fails
        const { data: directMsg } = await supabase
          .from("messages")
          .insert([{
            conversation_id: conversationId,
            sender_id: botSenderId,
            content: botMessageText,
            type: "text",
            sender_type: "ai"
          }])
          .select()
          .single();
        autoMsg = directMsg;
      }

      if (autoMsg) {
        autoMsg.sender_type = "ai";
        // Persist sender_type in DB
        await supabase.from("messages").update({ sender_type: "ai" }).eq("id", autoMsg.id);
        // Emit WebSocket to conversation room and to user specifically
        await realtime.emitToConversation(conversationId, "chat:message", autoMsg);
        await realtime.emitToUser(userId, "chat:message", autoMsg);
      }
      return { isEscalated: false, message: autoMsg };
    }

    // ── ESCALATION FLOW ───────────────────────────────────────────────────────
    this.metrics.ai_escalation_count++;
    const planService = require("./planService");
    const userPlan = await planService.getEffectivePlan(userId);
    const priority = this.calculatePriority(
      aiResponse?.operationalMetadata?.intent,
      aiResponse?.operationalMetadata?.category,
      content,
      userPlan.tier
    );
    const category = aiResponse?.operationalMetadata?.category || "General";
    const intent = aiResponse?.operationalMetadata?.intent || "Support Assistance";
    const confidence = aiResponse?.operationalMetadata?.confidence || 0.00;

    // ── STEP 2 & 3: Database Transaction (rpc_escalate_support_ticket) ──────
    logger.info(`[Escalation:Step2_TicketCreation & Step3_DatabaseSave] Executing atomic escalation RPC`, {
      conversationId,
      userId,
      reason: escalationReason,
      priority,
      category
    });

    let transactionResult = null;
    try {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("rpc_escalate_support_ticket", {
        p_conversation_id: conversationId,
        p_customer_id: userId,
        p_reason: escalationReason,
        p_priority: priority,
        p_category: category,
        p_intent: intent,
        p_confidence: confidence,
        p_ai_debug_metadata: aiResponse?.aiDebugMetadata || {},
        p_bot_sender_id: botSenderId,
        p_bot_message_content: botMessageText
      });

      if (rpcErr) {
        // Fallback if migration 208 stored proc not yet loaded
        logger.warn(`[Escalation:Step3_DatabaseSave] RPC failed (${rpcErr.message}) - executing JS transaction fallback`);
        transactionResult = await this._fallbackEscalationTransaction(
          conversationId, userId, escalationReason, priority, category, intent, confidence, aiResponse, botSenderId, botMessageText
        );
      } else {
        transactionResult = rpcResult;
      }
    } catch (dbErr) {
      this.metrics.rpc_failures++;
      logger.error(`[Escalation:Step3_DatabaseSave] DB Escalation Error: ${dbErr.message}`);
      // Final resilient fallback so message is never lost
      transactionResult = await this._fallbackEscalationTransaction(
        conversationId, userId, escalationReason, priority, category, intent, confidence, aiResponse, botSenderId, botMessageText
      );
    }

    // ── STEP 4: Realtime WebSocket Notification (STRICTLY AFTER DB COMMIT) ────
    logger.info(`[Escalation:Step4_RealtimeNotify] Emitting WebSocket events`, {
      conversationId,
      ticketId: transactionResult?.ticket_id
    });

    // 1. Emit escalation message to conversation
    const botMessageObj = {
      id: transactionResult?.message_id || `escalate-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: botSenderId,
      content: botMessageText,
      type: "text",
      created_at: new Date().toISOString(),
      sender_type: "ai"
    };

    await realtime.emitToConversation(conversationId, "chat:message", botMessageObj);

    // 2. Emit conversation status update to conversation room
    await realtime.emitToConversation(conversationId, "chat:conversation_updated", {
      id: conversationId,
      support_status: "escalated"
    });

    // 3. Notify Support Staff / Admins via Realtime
    try {
      const { data: supportUsers } = await supabase
        .from('user_permissions')
        .select('user_id, permissions!inner(name)')
        .eq('permissions.name', 'support.receive_ticket');

      const recipients = (supportUsers || []).map(u => u.user_id);
      
      for (const staffId of recipients) {
        await realtime.emitToUser(staffId, "support:new_ticket", {
          ticket_id: transactionResult?.ticket_id,
          conversation_id: conversationId,
          priority,
          category,
          intent,
          customer_id: userId
        });

        if (notificationService.createNotification) {
          await notificationService.createNotification({
            receiverId: staffId,
            type: 'new_support_ticket',
            title: 'New Support Ticket Escalated',
            message: `User needs help with ${category || 'general issue'}: ${(content || '').substring(0, 50)}...`,
            link: `/admin/chats?id=${conversationId}&ticket_id=${transactionResult?.ticket_id}`,
            conversationId: conversationId
          });
        }
      }

      await realtime.emitToAdmin("support:new_ticket", {
        ticket_id: transactionResult?.ticket_id,
        id: conversationId,
        conversation_id: conversationId,
        support_status: "escalated",
        priority,
        category
      });
      
      await realtime.emitToAdmin("chat:new_support_chat", {
        id: conversationId,
        support_status: "escalated",
        priority,
        category
      });
    } catch (notifErr) {
      logger.warn(`[Escalation:Step4_RealtimeNotify] Non-fatal notification error: ${notifErr.message}`);
    }

    return {
      isEscalated: true,
      ticketId: transactionResult?.ticket_id,
      message: botMessageObj,
      latencyMs: Date.now() - t0
    };
  }

  /**
   * Resilient JS Fallback for Escalation Transaction
   */
  async _fallbackEscalationTransaction(conversationId, userId, reason, priority, category, intent, confidence, aiResponse, botSenderId, botMessageText) {
    // 1. Update status
    await supabase.from("conversations").update({ support_status: "escalated", updated_at: new Date().toISOString() }).eq("id", conversationId);
    
    // 2. Insert message
    const { data: msgData } = await supabase.from("messages").insert([{
      conversation_id: conversationId,
      sender_id: botSenderId,
      content: botMessageText,
      type: "text",
      event_id: require("crypto").randomUUID()
    }]).select("id").single();

    // 3. Check existing ticket (idempotency)
    const { data: existing } = await supabase.from("support_tickets").select("id").eq("conversation_id", conversationId).not("status", "in", "(resolved,closed)").maybeSingle();
    
    let ticketId = existing?.id;
    if (!ticketId) {
      const ticketPayload = {
        conversation_id: conversationId,
        customer_id: userId,
        status: "open",
        priority: priority || "normal",
        category: category || "General",
        intent: intent || "General Request",
        confidence: confidence || 0.00,
        ai_debug_metadata: aiResponse?.aiDebugMetadata || {}
      };

      const { data: newTicket, error: tErr } = await supabase.from("support_tickets").insert([ticketPayload]).select("id").single();

      if (tErr) {
        logger.error(`[SupportService] Fallback ticket creation error: ${tErr.message}`, { details: tErr });
      }
      ticketId = newTicket?.id;
    }

    // 4. Log event
    if (ticketId) {
      await supabase.from("support_ticket_events").insert([{
        ticket_id: ticketId,
        event_type: "escalated",
        payload: { reason, conversation_id: conversationId }
      }]);
    }

    return { ticket_id: ticketId, message_id: msgData?.id, conversation_id: conversationId };
  }

  /**
   * GET /api/chat/support — Retrieves user's active support conversation payload
   */
  async getSupportChatForUser(userId) {
    try {
      // 1. Fetch user's active/latest support conversation
      const { data: convs, error: convErr } = await supabase
        .from("conversations")
        .select(`
          id, name, type, chat_type, support_status, created_at, updated_at,
          members:conversation_members (
            user_id, role, status,
            profile:profiles (id, username, full_name, avatar_url)
          )
        `)
        .eq("chat_type", "support")
        .select(`
          *,
          members:conversation_members!inner(user_id)
        `)
        .eq("members.user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (convErr || !convs || convs.length === 0) {
        return null;
      }

      let conversation = convs[0];

      // Note: Resolved or closed support chats remain read-only when fetched.
      // History is preserved and status is not altered on read operations.

      // 2. Fetch full timeline messages
      const { data: messages } = await supabase
        .from("messages")
        .select(`
          id, conversation_id, sender_id, content, type, created_at, read_at, delivered_at, event_id
        `)
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });

      // 3. Fetch ticket info & assigned admin
      const { data: ticket } = await supabase
        .from("support_tickets")
        .select(`
          id, status, priority, category, intent, confidence, escalation_reason, assigned_admin_id, claimed_at, claim_expires_at,
          assigned_admin:profiles!support_tickets_assigned_admin_id_fkey(id, username, full_name, avatar_url)
        `)
        .eq("conversation_id", conversation.id)
        .not("status", "in", "('resolved','closed')")
        .maybeSingle();

      // 4. Calculate unread count for user
      const { count: unreadCount } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", conversation.id)
        .neq("sender_id", userId)
        .is("read_at", null);

      return {
        conversation,
        messages: messages || [],
        ticket: ticket || null,
        supportStatus: conversation.support_status,
        assignedAdmin: ticket?.assigned_admin || null,
        unreadCount: unreadCount || 0
      };
    } catch (err) {
      logger.error(`[SupportService] getSupportChatForUser error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Explicitly Close Support Chat and Wipe Previous Messages
   */
  async closeSupportChat(conversationId, userId) {
    try {
      logger.info(`[SupportService] Closing support chat ${conversationId} for user ${userId}`);

      await supabase
        .from("conversations")
        .update({ support_status: "resolved", updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      // Delete previous message history to ensure clean slate on next session
      await supabase
        .from("messages")
        .delete()
        .eq("conversation_id", conversationId);

      await realtime.emitToConversation(conversationId, "chat:conversation_updated", {
        id: conversationId,
        support_status: "resolved"
      });

      return { success: true };
    } catch (err) {
      logger.error(`[SupportService] closeSupportChat error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Race-safe Optimistic Ticket Claiming
   */
  async claimTicket(ticketId, adminId) {
    logger.info(`[SupportService] Attempting ticket claim for ticket ${ticketId} by admin ${adminId}`);
    
    try {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("rpc_claim_support_ticket", {
        p_ticket_id: ticketId,
        p_admin_id: adminId,
        p_ttl_minutes: 15
      });

      if (!rpcErr && rpcResult) {
        return rpcResult;
      }

      // Fallback claim logic
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const { data: ticket } = await supabase
        .from("support_tickets")
        .select("assigned_admin_id, claim_expires_at, conversation_id")
        .eq("id", ticketId)
        .single();

      if (!ticket) return { success: false, claimed: false, reason: "TICKET_NOT_FOUND" };

      const isClaimExpired = ticket.claim_expires_at && new Date(ticket.claim_expires_at) < new Date();
      if (ticket.assigned_admin_id && ticket.assigned_admin_id !== adminId && !isClaimExpired) {
        return { success: false, claimed: false, reason: "TICKET_ALREADY_CLAIMED" };
      }

      await supabase
        .from("support_tickets")
        .update({
          assigned_admin_id: adminId,
          assigned_to: adminId,
          claimed_at: now,
          claim_expires_at: expiresAt,
          status: "assigned"
        })
        .eq("id", ticketId);

      if (ticket.conversation_id) {
        await supabase
          .from("conversations")
          .update({ support_status: "pending" })
          .eq("id", ticket.conversation_id);
          
        await realtime.emitToConversation(ticket.conversation_id, "chat:conversation_updated", {
          id: ticket.conversation_id,
          support_status: "pending"
        });
        
        await realtime.emitToAdmin("support:ticket_updated", {
          ticket_id: ticketId,
          conversation_id: ticket.conversation_id,
          status: "assigned",
          assigned_admin_id: adminId,
          claimed_at: now
        });
      }

      return { success: true, claimed: true, ticket_id: ticketId, assigned_admin_id: adminId };
    } catch (err) {
      logger.error(`[SupportService] claimTicket error: ${err.message}`);
      return { success: false, claimed: false, error: err.message };
    }
  }

  /**
   * Get Support Chats for Admin with Smart Queue Sorting
   * Sorting Priority: Priority (Urgent > High > Normal > Low) -> Waiting Time -> Unread -> Newest
   */
  async getSupportChatsForAdmin(statusFilter) {
    logger.info(`[Escalation:Step5_DashboardDisplay] Fetching support chats with filter: ${statusFilter || 'all'}`);
    
    let query = supabase
      .from("conversations")
      .select(`
        id, name, support_status, chat_type, updated_at, created_at,
        members:conversation_members (
          user_id, role, status,
          profile:profiles (username, full_name, avatar_url, is_online)
        ),
        lastMessage:messages(content, created_at, sender_id, read_at, delivered_at)
      `)
      .eq("chat_type", "support");

    if (statusFilter === "open") {
      // Treats all active non-resolved states as "Open"
      query = query.in("support_status", ["open", "pending", "escalated", "waiting", "warning_sent"]);
    } else if (statusFilter) {
      query = query.eq("support_status", statusFilter);
    }

    const { data: chats, error } = await query;
    if (error) throw error;

    // Fetch corresponding active tickets to apply Priority Matrix sorting
    const convIds = chats.map(c => c.id);
    let ticketMap = {};
    if (convIds.length > 0) {
      const { data: tickets } = await supabase
        .from("support_tickets")
        .select("conversation_id, priority, status, assigned_admin_id, escalation_reason, created_at")
        .in("conversation_id", convIds);
        
      (tickets || []).forEach(t => {
        ticketMap[t.conversation_id] = t;
      });
    }

    const PRIORITY_WEIGHTS = { urgent: 4, high: 3, normal: 2, low: 1 };

    const enriched = chats.map(chat => {
      const sortedMsgs = (chat.lastMessage || []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const ticket = ticketMap[chat.id];
      const priority = ticket?.priority || "normal";
      const priorityWeight = PRIORITY_WEIGHTS[priority] || 2;
      const waitingMs = Date.now() - new Date(chat.updated_at || chat.created_at).getTime();

      return {
        ...chat,
        lastMessage: sortedMsgs[0] || null,
        ticket: ticket || null,
        priority,
        priorityWeight,
        waitingMs
      };
    });

    // Smart Sort: Priority Weight DESC -> Waiting Duration DESC
    enriched.sort((a, b) => {
      if (b.priorityWeight !== a.priorityWeight) {
        return b.priorityWeight - a.priorityWeight;
      }
      return b.waitingMs - a.waitingMs;
    });

    return enriched;
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new SupportService();
