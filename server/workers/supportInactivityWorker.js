/**
 * Support Inactivity & Auto-Ending Worker — NoteStandard
 *
 * Monitors open/pending support chats.
 * 1. If a user receives a support/AI response and does not reply within 5 minutes,
 *    sends a courtesy warning message and updates status to 'warning_sent'.
 * 2. If the user still fails to respond within 3 minutes of the warning,
 *    sends a final closing message and marks the support chat as 'resolved'.
 */

const supabase = require("../config/database");
const realtime = require("../services/realtimeService");
const logger = require("../utils/logger");

const WARNING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CLOSING_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes after warning
const CHECK_INTERVAL_MS = 60 * 1000;      // 1 minute polling

class SupportInactivityWorker {
  constructor() {
    this.intervalRef = null;
    this.isProcessing = false;
  }

  start() {
    logger.info("[SupportInactivityWorker] Started support inactivity monitor (1m interval)");
    // Initial check
    this.checkInactivity().catch(err => logger.error("[SupportInactivityWorker] Error on initial check:", err.message));
    this.intervalRef = setInterval(() => {
      this.checkInactivity().catch(err => logger.error("[SupportInactivityWorker] Interval check error:", err.message));
    }, CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  async checkInactivity() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Fetch active support conversations (status: open, pending, warning_sent)
      const { data: conversations, error: convErr } = await supabase
        .from("conversations")
        .select("id, support_status, updated_at, members:conversation_members(user_id, role)")
        .eq("chat_type", "support")
        .in("support_status", ["open", "pending", "warning_sent"]);

      if (convErr || !conversations || conversations.length === 0) {
        this.isProcessing = false;
        return;
      }

      const now = Date.now();

      for (const conv of conversations) {
        // Find the non-admin user (customer) in members
        const customerMember = (conv.members || []).find(m => m.role === 'member' || m.role === 'user');
        const customerUserId = customerMember?.user_id;

        // Fetch the single latest message in this conversation
        const { data: latestMsgs } = await supabase
          .from("messages")
          .select("id, sender_id, content, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const latestMsg = latestMsgs?.[0];
        if (!latestMsg) continue;

        const lastMsgTime = new Date(latestMsg.created_at).getTime();
        const elapsedSinceLastMsg = now - lastMsgTime;
        const lastSenderIsUser = customerUserId && latestMsg.sender_id === customerUserId;

        // Dynamic bot sender ID fallback
        const botSenderId = latestMsg.sender_id && !lastSenderIsUser ? latestMsg.sender_id : (customerUserId || "00000000-0000-0000-0000-000000000000");

        // ── SCENARIO 1: Send warning message if user hasn't responded in 5+ mins ──
        if ((conv.support_status === "open" || conv.support_status === "pending") && !lastSenderIsUser) {
          if (elapsedSinceLastMsg >= WARNING_TIMEOUT_MS) {
            logger.info(`[SupportInactivityWorker] Sending inactivity warning for conv ${conv.id}`);

            const warningText = "I will be closing this chat if there are no further questions. Please let us know if you need anything else! 😊 If you still need help, please reply to this message within 3 minutes.";

            const { data: rpcData } = await supabase.rpc('rpc_send_message', {
              p_conversation_id: conv.id,
              p_sender_id: botSenderId,
              p_content: warningText,
              p_type: "text",
              p_event_id: require("crypto").randomUUID(),
              p_original_language: "en",
              p_attachment_id: null,
              p_reply_to_id: null
            });

            const warningMsg = rpcData?.message;

            await supabase
              .from("conversations")
              .update({ support_status: "warning_sent", updated_at: new Date().toISOString() })
              .eq("id", conv.id);

            if (warningMsg) {
              await realtime.emitToConversation(conv.id, "chat:message", warningMsg);
            }
          }
        }

        // ── SCENARIO 2: Auto-close support chat if user still hasn't responded after warning ──
        if (conv.support_status === "warning_sent" && !lastSenderIsUser) {
          if (elapsedSinceLastMsg >= CLOSING_TIMEOUT_MS) {
            logger.info(`[SupportInactivityWorker] Auto-closing idle support chat ${conv.id}`);

            const closingText = "This support chat session is now closed due to inactivity. ✅ Whenever you reach out to our AI support team again, your previous conversation will be wiped clean so you start with a fresh new session! Have a great day! – Note Standard Support Team";

            const { data: rpcData } = await supabase.rpc('rpc_send_message', {
              p_conversation_id: conv.id,
              p_sender_id: botSenderId,
              p_content: closingText,
              p_type: "text",
              p_event_id: require("crypto").randomUUID(),
              p_original_language: "en",
              p_attachment_id: null,
              p_reply_to_id: null
            });

            const closingMsg = rpcData?.message;

            await supabase
              .from("conversations")
              .update({ support_status: "resolved", updated_at: new Date().toISOString() })
              .eq("id", conv.id);

            if (closingMsg) {
              await realtime.emitToConversation(conv.id, "chat:message", closingMsg);
            }

            await realtime.emitToConversation(conv.id, "chat:conversation_updated", {
              id: conv.id,
              support_status: "resolved"
            });
          }
        }
      }
    } catch (err) {
      logger.error("[SupportInactivityWorker] Execution error:", err.message);
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new SupportInactivityWorker();
