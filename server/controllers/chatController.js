const path = require("path");
const supabase = require(path.join(__dirname, "..", "config", "supabase"));
const { createNotification } = require("../services/notificationService");
const { detectLanguage } = require("../services/translationService");

// --- Conversations ---

exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch conversations where user is a member
    const { data, error } = await supabase
      .from("conversation_members")
      .select(`
                conversation:conversations (
                    id,
                    type,
                    chat_type,
                    support_status,
                    name,
                    updated_at,
                    members:conversation_members (
                        user_id,
                        role,
                        status,
                        profile:profiles (
                            username,
                            full_name,
                            avatar_url
                        )
                    )
                )
            `)
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });

    if (error) throw error;

    // Transform structure for client
    const conversations = data.map((item) => item.conversation);
    res.json(conversations);
  } catch (err) {
    console.error("Error fetching conversations:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.createConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, name, participants: recipientUsernames } = req.body;

    if (!recipientUsernames || recipientUsernames.length === 0) {
      return res.status(400).json({
        error: "Participants (usernames) required",
      });
    }

    // 1. Resolve Usernames to IDs
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username")
      .in("username", recipientUsernames);

    if (
      profileError || !profiles || profiles.length !== recipientUsernames.length
    ) {
      return res.status(404).json({ error: "One or more users not found" });
    }

    const participantIds = profiles.map((p) => p.id);

    // 2. For direct chats, check if a conversation already exists
    if (type === "direct" && participantIds.length === 1) {
      const recipientId = participantIds[0];

      // Query to find if these two users already share a direct conversation
      const { data: existingMembers, error: checkError } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversation:conversations!inner(type)")
        .eq("user_id", userId)
        .eq("conversation.type", "direct");

      if (!checkError && existingMembers && existingMembers.length > 0) {
        const convIds = existingMembers.map((m) => m.conversation_id);

        const { data: commonMember, error: commonError } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .in("conversation_id", convIds)
          .eq("user_id", recipientId)
          .maybeSingle();

        if (commonMember) {
          // Found existing conversation, fetch it and return
          const { data: fullConv } = await supabase
            .from("conversations")
            .select(`
              *,
              members:conversation_members (
                user_id,
                role,
                status,
                profile:profiles (
                  username,
                  full_name,
                  avatar_url
                )
              )
            `)
            .eq("id", commonMember.conversation_id)
            .single();

          return res.json({
            conversation: fullConv,
            isExisting: true,
          });
        }
      }
    }

    // 3. Create Conversation
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .insert([{ type, name }])
      .select()
      .single();

    if (convError) throw convError;
    const conversationId = convData.id;

    // 4. Prepare Members Payload
    const membersPayload = [
      {
        conversation_id: conversationId,
        user_id: userId,
        role: "admin",
        status: "accepted",
      },
    ];

    for (const pId of participantIds) {
      membersPayload.push({
        conversation_id: conversationId,
        user_id: pId,
        role: "member",
        status: "pending",
      });
    }

    const { error: memberError } = await supabase
      .from("conversation_members")
      .insert(membersPayload);

    if (memberError) throw memberError;

    // 5. Send notifications
    const io = req.app.get("io");
    if (io) {
      const { data: creator } = await supabase.from("profiles").select(
        "username",
      ).eq("id", userId).single();
      for (const p of profiles) {
        await createNotification({
          receiverId: p.id,
          senderId: userId,
          type: "chat_request",
          title: "New Chat Request",
          message: `${
            creator?.username || "Someone"
          } wants to start a chat with you`,
          link: `/dashboard/chat?id=${conversationId}`,
          io,
        });

        // CRITICAL: Emit new_conversation event so recipients join the room real-time
        io.to(p.id).emit("new_conversation", convData);
      }
    }

    res.json({
      conversation: convData,
      members: membersPayload,
      resolvedParticipants: profiles,
    });
  } catch (err) {
    console.error("Error creating conversation:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.acceptConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Check if member exists and status
    const { data: existingMember, error: fetchError } = await supabase
      .from("conversation_members")
      .select("status")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingMember) {
      return res.status(404).json({
        error: "You are not a member of this chat",
      });
    }

    if (existingMember.status === "accepted") {
      return res.json({
        success: true,
        message: "Already accepted",
        member: [existingMember],
      });
    }

    // Update status to accepted
    const { data, error } = await supabase
      .from("conversation_members")
      .update({ status: "accepted" })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .select();

    if (error) throw error;

    // Notify other members
    const io = req.app.get("io");
    if (io) {
      const { data: members } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", userId);

      const { data: accepter } = await supabase.from("profiles").select(
        "username",
      ).eq("id", userId).single();

      if (members) {
        for (const m of members) {
          await createNotification({
            receiverId: m.user_id,
            senderId: userId,
            type: "chat_accepted",
            title: "Chat Request Accepted",
            message: `${
              accepter?.username || "A user"
            } accepted your chat request`,
            link: `/dashboard/chat?id=${conversationId}`,
            io,
          });

          // Notify about the change in conversation status
          io.to(m.user_id).emit("conversation_updated", {
            conversationId,
            userId,
            status: "accepted",
          });
        }
      }

      // Also notify self across tabs
      io.to(userId).emit("conversation_updated", {
        conversationId,
        userId,
        status: "accepted",
      });
    }

    res.json({ success: true, member: data });
  } catch (err) {
    console.error("Error accepting conversation:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// --- Messages ---

exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.user.id;

    // Fetch cleared_at for the user
    const { data: member } = await supabase
      .from("conversation_members")
      .select("cleared_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .single();

    const clearedAt = member?.cleared_at;

    // Try full query with attachments first
    try {
      let query = supabase
        .from("messages")
        .select(`
                    *,
                    attachment:media_attachments(*)
                `)
        .eq("conversation_id", conversationId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(parseInt(limit));

      if (before) {
        query = query.lt("created_at", before);
      }

      if (clearedAt) {
        query = query.gt("created_at", clearedAt);
      }

      const { data, error } = await query;

      if (error) {
        // If the error is about missing relationship/table, fallback to basic query
        if (
          error.code === "PGRST200" ||
          error.message.includes("media_attachments")
        ) {
          console.warn(
            "[Chat Controller] Falling back to basic messages query (media_attachments missing)",
          );
          const { data: simpleData, error: simpleError } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(parseInt(limit));

          if (simpleError) throw simpleError;
          return res.json((simpleData || []).reverse());
        }
        throw error;
      }
      res.json((data || []).reverse());
    } catch (innerErr) {
      console.warn("[Chat Controller] Inner query error:", innerErr.message);
      // Final fallback
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(parseInt(limit));
      if (error) throw error;
      res.json((data || []).reverse());
    }
  } catch (err) {
    console.error("Error fetching messages:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.searchMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { q } = req.query;

    if (!q) return res.status(400).json({ error: "Search query required" });

    // Try full query with attachments
    try {
      const { data, error } = await supabase
        .from("messages")
        .select(`
                    *,
                    attachment:media_attachments(*)
                `)
        .eq("conversation_id", conversationId)
        .eq("is_deleted", false)
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        if (
          error.code === "PGRST200" ||
          error.message.includes("media_attachments")
        ) {
          console.warn(
            "[Chat Controller] Falling back to basic search (media_attachments missing)",
          );
          const { data: simpleData, error: simpleError } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .ilike("content", `%${q}%`)
            .order("created_at", { ascending: false })
            .limit(100);

          if (simpleError) throw simpleError;
          return res.json(simpleData);
        }
        throw error;
      }
      res.json(data);
    } catch (innerErr) {
      console.warn("[Chat Controller] Search error:", innerErr.message);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      res.json(data);
    }
  } catch (err) {
    console.error("Error searching messages:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.markMessageRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    try {
      const { data, error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", messageId)
        .neq("sender_id", userId) // Only mark as read if not the sender
        .select()
        .single();

      if (error) {
        if (error.code === "42703" || error.code === "PGRST204") {
          console.warn(
            "[Chat Controller] read_at column missing, skipping update",
          );
          return res.json({ success: true, note: "read_at column missing" });
        }
        throw error;
      }

      // Emit read receipt via socket
      const io = req.app.get("io");
      io.to(data.conversation_id).emit("message_read", {
        messageId,
        conversationId: data.conversation_id,
        userId,
      });

      res.json({ success: true });
    } catch (updateErr) {
      console.warn("[Chat Controller] Failed to mark read:", updateErr.message);
      res.json({ success: true, error: "Feature unavailable" });
    }
  } catch (err) {
    console.error("Error marking message read:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, type } = req.body;
    const userId = req.user.id;

    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    // Analysis: Sentiment (if text)
    let sentiment = null;
    let detectedLang = "en";

    if ((type === "text" || !type) && content) {
      const Sentiment = require("sentiment");
      const analyzer = new Sentiment();
      const result = analyzer.analyze(content);
      sentiment = {
        score: result.score,
        comparative: result.comparative,
        label: result.score > 0
          ? "positive"
          : result.score < 0
          ? "negative"
          : "neutral",
      };

      // Detect Language
      detectedLang = await detectLanguage(content);
    }

    // Prepare insert payload
    const insertPayload = {
      conversation_id: conversationId,
      sender_id: userId,
      content: content,
      type: type || "text",
      original_language: detectedLang,
    };

    // Add optional columns only if they likely exist (based on logic or we can try/catch)
    // For production safety, we'll try a fail-safe insert pattern
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert([{
          ...insertPayload,
          sentiment: sentiment,
          attachment_id: req.body.attachmentId || null,
        }])
        .select()
        .single();

      if (error) {
        // If it's a "column does not exist" error (42703 for Postgres, PGRST204 for PostgREST cache)
        if (error.code === "42703" || error.code === "PGRST204") {
          console.warn(
            "[Chat Controller] Column missing, retrying basic insert",
          );
          const { data: retryData, error: retryErr } = await supabase
            .from("messages")
            .insert([insertPayload])
            .select()
            .single();

          if (retryErr) throw retryErr;
          processAfterMsg(retryData);
        } else {
          throw error;
        }
      } else {
        processAfterMsg(data);
      }
    } catch (msgErr) {
      console.error("[Chat Controller] Send message error:", msgErr.message);
      return res.status(500).json({ error: "Failed to send message" });
    }

    async function processAfterMsg(data) {
      // Update conversation timestamp (non-blocking)
      supabase.from("conversations").update({ updated_at: new Date() }).eq(
        "id",
        conversationId,
      ).then();

      // Fetch with attachment details for real-time recipients
      try {
        const { data: fullMessage, error: fetchErr } = await supabase
          .from("messages")
          .select("*, attachment:media_attachments(*)")
          .eq("id", data.id)
          .single();

        const msgToSend = (!fetchErr && fullMessage) ? fullMessage : data;
        const io = req.app.get("io");
        io.to(conversationId).emit("receive_message", msgToSend);

        res.json(msgToSend);
      } catch (err) {
        const io = req.app.get("io");
        io.to(conversationId).emit("receive_message", data);
        res.json(data);
      }
    }

    // --- Notification Logic ---
    const io = req.app.get("io");
    try {
      // Get conversation members to notify them
      const { data: members, error: memberError } = await supabase
        .from("conversation_members")
        .select("user_id, is_muted")
        .eq("conversation_id", conversationId)
        .neq("user_id", userId); // Don't notify the sender

      if (!memberError && members) {
        // Fetch sender info for the notification title
        const { data: sender } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .single();

        for (const member of members) {
          if (member.is_muted) {
            console.log(`[Chat Notify] Skipping muted user: ${member.user_id}`);
            continue;
          }

          await createNotification({
            receiverId: member.user_id,
            senderId: userId,
            type: "chat_message",
            title: "New Message",
            message: `${sender?.username || "Someone"} sent you a message: ${
              content.substring(0, 50)
            }${content.length > 50 ? "..." : ""}`,
            link: `/dashboard/chat?id=${conversationId}`,
            io,
          });
        }
      }

      // --- Mention Logic ---
      const mentions = content.match(/@(\w+)/g);
      if (mentions) {
        const usernames = mentions.map((m) => m.substring(1));
        const { data: mentionedUsers } = await supabase
          .from("profiles")
          .select("id, username")
          .in("username", usernames);

        if (mentionedUsers) {
          // Fetch sender info if not already fetched
          const senderName =
            (await supabase.from("profiles").select("username").eq("id", userId)
              .single()).data?.username || "Someone";

          for (const mUser of mentionedUsers) {
            if (mUser.id !== userId) { // Don't notify self
              await createNotification({
                receiverId: mUser.id,
                senderId: userId,
                type: "mention",
                title: "You were mentioned",
                message: `${senderName} mentioned you in a chat: "${
                  content.substring(0, 50)
                }..."`,
                link: `/dashboard/chat?id=${conversationId}`,
                io,
              });
            }
          }
        }
      }
    } catch (notifErr) {
      console.error("Failed to send notification or mention:", notifErr);
    }

    // --- AI Auto-Reply Logic ---
    try {
      // 1. Check if this is a support chat and sender is the user (not admin)
      const { data: conv } = await supabase
        .from("conversations")
        .select("chat_type, support_status")
        .eq("id", conversationId)
        .single();

      if (conv?.chat_type === "support") {
        // 2. Fetch auto-reply settings
        const { data: settings } = await supabase
          .from("auto_reply_settings")
          .select("*")
          .single();

        if (settings?.enabled) {
          // 3. Check offline hours
          const now = new Date();
          const hours = now.getUTCHours(); // Simple UTC check for now
          const start = parseInt(settings.start_hour.split(":")[0]);
          const end = parseInt(settings.end_hour.split(":")[0]);

          let isOffline = false;
          if (start > end) { // Overnights (e.g., 18:00 to 09:00)
            isOffline = hours >= start || hours < end;
          } else {
            isOffline = hours >= start && hours < end;
          }

          if (isOffline) {
            // 4. Send auto-reply message
            const { data: autoMsg, error: autoErr } = await supabase
              .from("messages")
              .insert([{
                conversation_id: conversationId,
                sender_id: "00000000-0000-0000-0000-000000000000", // System/Bot ID
                content: settings.message,
                type: "text",
              }])
              .select()
              .single();

            if (!autoErr) {
              io.to(conversationId).emit("receive_message", autoMsg);
            }
          }
        }
      }
    } catch (autoReplyErr) {
      console.error("Auto-reply logic failed:", autoReplyErr);
    }
  } catch (err) {
    console.error("Error sending message:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Create support chat - User contacts admin
exports.createSupportChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject } = req.body;

    // Check if user already has an open support chat
    const { data: existingChats } = await supabase
      .from("conversations")
      .select(`
                id,
                support_status,
                members:conversation_members!inner (user_id)
            `)
      .eq("chat_type", "support")
      .neq("support_status", "resolved")
      .eq("members.user_id", userId);

    if (existingChats && existingChats.length > 0) {
      return res.status(400).json({
        error: "You already have an open support chat",
        existingChatId: existingChats[0].id,
      });
    }

    // Get user profile for chat name
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();

    // Create support conversation
    const chatName = subject || `Support: ${profile?.username || "User"}`;
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .insert([{
        type: "direct",
        name: chatName,
        chat_type: "support",
        support_status: "open",
      }])
      .select()
      .single();

    if (convError) throw convError;

    // Add user as member
    const { error: memberError } = await supabase
      .from("conversation_members")
      .insert([{
        conversation_id: convData.id,
        user_id: userId,
        role: "member",
        status: "accepted",
      }]);

    if (memberError) throw memberError;

    // Notify admins via Socket.IO
    const io = req.app.get("io");
    io.to("admin_room").emit("new_support_chat", {
      ...convData,
      user: profile,
    });

    res.json({ conversation: convData });
  } catch (err) {
    console.error("Error creating support chat:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Delete conversation
exports.deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify user is a member of the conversation
    const { data: member, error: memberError } = await supabase
      .from("conversation_members")
      .select("role")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .single();

    if (memberError || !member) {
      console.error("[Chat Delete] Membership verification failed:", {
        conversationId,
        userId,
        error: memberError?.message,
        memberFound: !!member,
      });
      return res.status(403).json({
        error: "Access denied or conversation not found",
      });
    }

    // Delete messages first (if cascade delete isn't fully set up in Supabase)
    const { error: msgDeleteError } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId);

    if (msgDeleteError) throw msgDeleteError;

    // Delete members
    const { error: membersDeleteError } = await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversationId);

    if (membersDeleteError) throw membersDeleteError;

    // Delete attachments metadata (if any)
    const { error: attachmentsDeleteError } = await supabase
      .from("attachments")
      .delete()
      .eq("conversation_id", conversationId);

    if (attachmentsDeleteError) {
      console.warn(
        "Could not delete attachments metadata:",
        attachmentsDeleteError.message,
      );
    }

    // Delete conversation
    const { error: convDeleteError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (convDeleteError) throw convDeleteError;

    // Notify participants via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.to(conversationId).emit("conversation_deleted", { conversationId });
    }

    res.json({ success: true, message: "Conversation deleted successfully" });
  } catch (err) {
    console.error("Error deleting conversation:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Mute/Unmute conversation
exports.muteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { isMuted } = req.body;
    const userId = req.user.id;

    const { error } = await supabase
      .from("conversation_members")
      .update({ is_muted: isMuted })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({ success: true, is_muted: isMuted });
  } catch (err) {
    console.error("Error muting conversation:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Clear chat history for user
exports.clearChatHistory = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const { error } = await supabase
      .from("conversation_members")
      .update({ cleared_at: new Date() })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({ success: true, message: "Chat history cleared" });
  } catch (err) {
    console.error("Error clearing chat history:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Delete a specific message (soft delete)
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    // Soft delete the message
    const { data, error } = await supabase
      .from("messages")
      .update({
        is_deleted: true,
        content: "Message deleted", // Optional: scrub content
      })
      .eq("id", messageId)
      .eq("sender_id", userId) // Force ownership
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({
          error: "Message not found or you don't have permission to delete it",
        });
      }
      throw error;
    }

    // Notify via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.to(data.conversation_id).emit("message_deleted", {
        messageId,
        conversationId: data.conversation_id,
      });
    }

    res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    console.error("Error deleting message:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};
