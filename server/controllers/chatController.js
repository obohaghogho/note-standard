const supabase = require("../config/database");
const { createNotification } = require("../services/notificationService");
const { detectLanguage } = require("../services/translationService");
const realtime = require("../services/realtimeService");

// --- Conversations ---

exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[Chat PERSISTENCE] Fetching for user: ${userId}`);
    
    // Safety: Log headers to ensure no auth mismatch during build deployments
    console.log(`[Chat AUTH] Client Type: ${req.headers['x-client-type'] || 'web'}`);

    // 1. Fetch memberships with basic conversation data
    let memberships = [];
    try {
      const { data, error } = await supabase
        .from("conversation_members")
        .select("conversation_id, role, status")
        .eq("user_id", userId);
      
      if (error) {
        // Fallback for missing 'role' or 'status' columns
        if (error.code === '42703') {
           console.warn(`[Chat] role/status missing in conversation_members, falling back`);
           const { data: fallbackData, error: fallbackError } = await supabase
             .from("conversation_members")
             .select("conversation_id")
             .eq("user_id", userId);
           
           if (fallbackError) throw fallbackError;
           memberships = fallbackData || [];
        } else {
           throw error;
        }
      } else {
        memberships = data || [];
      }
    } catch (e) {
      console.error(`[Chat] Membership fetch error for ${userId}:`, e.message);
      return res.status(500).json({ 
        error: "Failed to load chat memberships", 
        details: e.message
      });
    }

    console.log(`[Chat] User ${userId} has ${memberships.length} memberships`);

    if (memberships.length === 0) {
      return res.json([]);
    }

    const conversationIds = memberships.map(m => m.conversation_id);

    // 2. Fetch conversations data in batch
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", conversationIds);

    if (convError) {
      console.error("[Chat] Conversations fetch error:", convError.message);
      return res.status(500).json({ error: "Failed to load conversation details" });
    }

    // 3. Enrich conversations with members and last message
    const enriched = await Promise.all(conversations.map(async (conv) => {
      try {
        const membership = memberships.find(m => m.conversation_id === conv.id);
        
        // Fetch all members for this conversation
        let members = [];
        try {
          const { data, error } = await supabase
            .from("conversation_members")
            .select(`
              user_id,
              role,
              status,
              profile:profiles (
                id,
                username,
                full_name,
                avatar_url,
                is_verified,
                plan_tier
              )
            `)
            .eq("conversation_id", conv.id);
          
          if (error) {
            // Fallback for missing profile columns or status/role
            const { data: fallbackData } = await supabase
              .from("conversation_members")
              .select(`
                user_id,
                profile:profiles (
                  id,
                  username,
                  full_name,
                  avatar_url
                )
              `)
              .eq("conversation_id", conv.id);
            members = fallbackData || [];
          } else {
            members = data || [];
          }
        } catch (e) {
          console.warn(`[Chat] Member enrichment failed for ${conv.id}:`, e.message);
        }

        // Fetch last message
        const { data: lastMsgs, error: msgError } = await supabase
          .from("messages")
          .select("id, content, sender_id, created_at, type, read_at, delivered_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (msgError) {
          console.warn(`[Chat] Last msg fetch error for ${conv.id}:`, msgError.message);
        }

        // Fetch unread count for the user in this conversation
        let unreadCount = 0;
        try {
          const { count, error: countError } = await supabase
            .from("messages")
            .select("*", { count: 'exact', head: true })
            .eq("conversation_id", conv.id)
            .neq("sender_id", userId)
            .is("read_at", null);
          
          if (!countError) unreadCount = count || 0;
        } catch (e) {
          console.warn(`[Chat] Unread count query failed for ${conv.id}:`, e.message);
        }

        return {
          ...conv,
          unreadCount,
          membership: {
            role: membership?.role || "member",
            status: membership?.status || "accepted",
            cleared_at: null,
            joined_at: null
          },
          members: members || [],
          last_message: lastMsgs?.[0] || null
        };
      } catch (e) {
        console.error(`[Chat] Enrichment failed for conv ${conv.id}:`, e.message);
        return { ...conv, members: [], last_message: null, unreadCount: 0 };
      }
    }));

    // Sort by updated_at or created_at
    const sorted = enriched.sort((a, b) => {
      const timeA = new Date(a.last_message?.created_at || a.updated_at || a.created_at).getTime();
      const timeB = new Date(b.last_message?.created_at || b.updated_at || b.created_at).getTime();
      return timeB - timeA;
    }).filter(c => c.chat_type !== "support" && c.name !== "Support Chat" && !(c.name && c.name.toLowerCase().includes("support team")));

    res.json(sorted);
  } catch (err) {
    console.error("[Chat] getConversations Critical Error:", err.message, err.stack);
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: err.message
    });
  }
};

exports.createSupportChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { message } = req.body;

    console.log(`[Chat Support] Creating support chat for user ${userId}`);

    // 1. Create a new support conversation
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select()
      .eq("type", "direct")
      .eq("chat_type", "support")
      .eq("support_status", "open")
      .single(); // Actually, users should usually have only one open support chat?
    
    let conversationId;

    if (conv) {
      conversationId = conv.id;
    } else {
      const { data: newConv, error: newConvError } = await supabase
        .from("conversations")
        .insert([{ 
          type: "direct", 
          chat_type: "support", 
          support_status: "open",
          name: "Support Chat"
        }])
        .select()
        .single();
      
      if (newConvError) throw newConvError;
      conversationId = newConv.id;

      // Add user as member
      await supabase.from("conversation_members").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "admin", // User is "admin" of their own support chat in this context?
        status: "accepted"
      });

      // Find all system admins to add as support agents
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .in("role", ["admin", "support"]);
      
      if (admins) {
        const adminMembers = admins.map(a => ({
          conversation_id: conversationId,
          user_id: a.id,
          role: "support",
          status: "pending"
        }));
        await supabase.from("conversation_members").insert(adminMembers);
        
        // Notify admins
        for (const admin of admins) {
           await realtime.emitToUser(admin.id, "chat:new_conversation", newConv);
        }
      }
    }

    // 2. If initial message provided, send it
    if (message) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        content: message,
        type: "text"
      });
    }

    res.json({ success: true, conversationId });
  } catch (err) {
    console.error("Error creating support chat:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.createConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, name, participants: recipientUsernames } = req.body;

    console.log(`[Chat] createConversation request from ${userId} for participants:`, recipientUsernames);

    if (!recipientUsernames || recipientUsernames.length === 0) {
      return res.status(400).json({ error: "Participants (usernames) required" });
    }

    // 1. Resolve Usernames to IDs (Case-Insensitive)
    const normalizedUsernames = recipientUsernames.map(u => u.trim().toLowerCase());
    
    // Attempt batch resolution first
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username")
      .in("username", recipientUsernames);
    
    let finalProfiles = profiles || [];

    // Fallback for case-insensitive if some were not found
    if (finalProfiles.length !== recipientUsernames.length) {
      for (const username of recipientUsernames) {
        if (!finalProfiles.find(p => p.username?.toLowerCase() === username.toLowerCase())) {
          const { data: p } = await supabase
            .from("profiles")
            .select("id, username")
            .ilike("username", username)
            .maybeSingle();
          if (p) finalProfiles.push(p);
        }
      }
    }

    if (finalProfiles.length === 0) {
      return res.status(404).json({ error: "No valid participants found" });
    }

    const participantIds = finalProfiles.map((p) => p.id);

    // 2. Check for existing direct conversation
    if (type === "direct" && participantIds.length === 1) {
      const recipientId = participantIds[0];

      // Find conversations the current user is in
      const { data: myMemberships } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", userId);

      if (myMemberships && myMemberships.length > 0) {
        const convIds = myMemberships.map(m => m.conversation_id);
        
        // Find if the recipient is in any of those same conversations
        const { data: commonMemberships } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .in("conversation_id", convIds)
          .eq("user_id", recipientId);

        if (commonMemberships && commonMemberships.length > 0) {
          // Check if any of these common conversations are 'direct'
          const finalConvIds = commonMemberships.map(m => m.conversation_id);
          const { data: existingConvs } = await supabase
            .from("conversations")
            .select("id, type")
            .in("id", finalConvIds)
            .eq("type", "direct");

          if (existingConvs && existingConvs.length > 0) {
            const existingId = existingConvs[0].id;
            
            const { data: conv } = await supabase
              .from("conversations")
              .select("*")
              .eq("id", existingId)
              .single();

            const { data: members } = await supabase
              .from("conversation_members")
              .select(`
                user_id, role, status,
                profile:profiles (id, username, full_name, avatar_url, is_verified)
              `)
              .eq("conversation_id", existingId);

            return res.json({
              conversation: { ...conv, members: members || [] },
              isExisting: true
            });
          }
        }
      }
    }

    // 3. Create New Conversation
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .insert([{ type: type || 'direct', name }])
      .select()
      .single();

    if (convError) {
      console.error("[Chat] Error creating conversation entry:", convError.message);
      throw convError;
    }

    const conversationId = convData.id;

    // 4. Add Members
    const membersPayload = [
      {
        conversation_id: conversationId,
        user_id: userId,
        role: "admin",
        status: "accepted",
      },
      ...participantIds.map((pId) => ({
        conversation_id: conversationId,
        user_id: pId,
        role: "member",
        status: "pending",
      })),
    ];

    const { error: memberError } = await supabase
      .from("conversation_members")
      .insert(membersPayload);

    if (memberError) {
      console.error("[Chat] Error adding members:", memberError.message);
      await supabase.from("conversations").delete().eq("id", conversationId);
      throw memberError;
    }

    // 5. Return complete conversation object
    const { data: finalMembers } = await supabase
      .from("conversation_members")
      .select(`
        user_id, role, status,
        profile:profiles (id, username, full_name, avatar_url, is_verified)
      `)
      .eq("conversation_id", conversationId);

    const result = {
      conversation: { ...convData, members: finalMembers || [] },
      isExisting: false
    };

    // Notify participants via Gateway and Database
    try {
      const { data: creator } = await supabase.from("profiles").select("username").eq("id", userId).single();
      
      await realtime.emitToUser(userId, "chat:new_conversation", result.conversation);
      
      for (const pId of participantIds) {
        await createNotification({
          receiverId: pId,
          senderId: userId,
          type: "chat_request",
          title: "New Chat Request",
          message: `${creator?.username || "Someone"} wants to start a chat with you`,
          link: `/dashboard/chat?id=${conversationId}`,
        });
        await realtime.emitToUser(pId, "chat:new_conversation", result.conversation);
      }
    } catch (e) {
      console.warn("[Chat] Notification/Socket emission failed in createConversation:", e.message);
    }

    res.json(result);
  } catch (err) {
    console.error("[Chat] createConversation Fatal Error:", err.message);
    res.status(500).json({ error: "Failed to create conversation", details: err.message });
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
    const { data: updatedMember, error: updateError } = await supabase
      .from("conversation_members")
      .update({ status: "accepted" })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .select()
      .single();

    if (updateError) {
      console.error("[Chat] Error updating member status:", updateError.message);
      throw updateError;
    }

    // Notify other members
    try {
      const { data: members } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", userId);

      const { data: accepter } = await supabase.from("profiles").select("username").eq("id", userId).single();

      if (members) {
        for (const m of members) {
          await createNotification({
            receiverId: m.user_id,
            senderId: userId,
            type: "chat_accepted",
            title: "Chat Request Accepted",
            message: `${accepter?.username || "Someone"} accepted your chat request!`,
            link: `/dashboard/chat?id=${conversationId}`,
          });
          await realtime.emitToUser(m.user_id, "chat:conversation_updated", { conversationId, userId, status: "accepted" });
        }
      }
    } catch (notifErr) {
      console.warn("[Chat] Notification failure in acceptConversation:", notifErr.message);
    }

    // Also notify self across other tabs/devices
    await realtime.emitToUser(userId, "chat:conversation_updated", {
      conversationId,
      userId,
      status: "accepted",
    });

    res.json({ success: true, member: updatedMember });
  } catch (err) {
    console.error("[Chat] Error accepting conversation:", err.message);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
};

// --- Messages ---

exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.user.id;

    let clearedAt = null;
    try {
      // Fetch cleared_at for the user - wrap in try-catch as column might be missing
      const { data: member } = await supabase
        .from("conversation_members")
        .select("cleared_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();

      clearedAt = member?.cleared_at;
    } catch (e) {
      console.warn("[Chat] Could not fetch cleared_at (column might be missing):", e.message);
    }

    // Build the main messages query with attachment join
    let query = supabase
      .from("messages")
      .select("*, attachment:media_attachments(*), sender:profiles(id, username, full_name, avatar_url), reply_to:messages(id, content, sender_id)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

      if (before) {
        query = query.lt("created_at", before);
      }

      if (clearedAt) {
        query = query.gt("created_at", clearedAt);
      }

    try {
      const { data, error } = await query;

      if (error) {
        // If the error is about missing relationship/table, fallback to basic query
        if (
          error.code === "PGRST200" ||
          error.code === "42703" ||
          error.message.includes("media_attachments")
        ) {
          console.warn(
            "[Chat Controller] Falling back to basic messages query",
          );
          let fallbackQuery = supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(parseInt(limit));
          
          if (before) fallbackQuery = fallbackQuery.lt("created_at", before);
          if (clearedAt) fallbackQuery = fallbackQuery.gt("created_at", clearedAt);

          const { data: simpleData, error: simpleError } = await fallbackQuery;

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
    res.status(500).json({ error: "Server Error", details: err.message });
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
        .select("*, attachment:media_attachments(*)")
        .eq("conversation_id", conversationId)
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
    const now = new Date().toISOString();

    try {
      let msgRow = null;
      let readAt = now;

      const { data, error } = await supabase
        .from("messages")
        .update({ read_at: now })
        .eq("id", messageId)
        .neq("sender_id", userId) // Only mark as read if not the sender
        .select()
        .single();

      if (error) {
        if (error.code === "42703") {
          // Column doesn't exist — nothing we can do, skip gracefully
          console.warn("[Chat Controller] read_at column missing, skipping update");
          return res.json({ success: true, note: "read_at column missing" });
        }
        if (error.code === "PGRST204") {
          // 0 rows updated — message may already be read, or sender_id === userId.
          // Fall back to a plain SELECT so we can still emit with the stored timestamp.
          console.warn("[Chat Controller] markMessageRead: 0 rows updated, falling back to SELECT");
          const { data: existing } = await supabase
            .from("messages")
            .select("id, conversation_id, sender_id, read_at")
            .eq("id", messageId)
            .single();
          if (existing && existing.sender_id !== userId) {
            msgRow = existing;
            readAt = existing.read_at || now;
          } else {
            return res.json({ success: true, note: "no-op" });
          }
        } else {
          throw error;
        }
      } else {
        msgRow = data;
      }

      if (!msgRow) return res.json({ success: true, note: "no-op" });

      const receiptPayload = { messageId, conversationId: msgRow.conversation_id, userId, readAt };

      // Emit to conversation room (for ChatScreen listeners)
      await realtime.emitToConversation(msgRow.conversation_id, "chat:message_read", receiptPayload);
      // ALSO emit directly to the original sender so their ChatList updates too
      await realtime.emitToUser(msgRow.sender_id, "chat:message_read", receiptPayload);

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

exports.markMessageDelivered = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const now = new Date().toISOString();

    try {
      let msgRow = null;
      let deliveredAt = now;

      const { data, error } = await supabase
        .from("messages")
        .update({ delivered_at: now })
        .eq("id", messageId)
        .neq("sender_id", userId) // Only mark as delivered if not the sender
        .select()
        .single();

      if (error) {
        if (error.code === "42703") {
          // Column doesn't exist — skip gracefully
          console.warn("[Chat Controller] delivered_at column missing, skipping update");
          return res.json({ success: true, note: "delivered_at column missing" });
        }
        if (error.code === "PGRST204") {
          // 0 rows updated — message already delivered, or sender_id === userId.
          // Fall back to SELECT so we can still emit with the actual stored timestamp.
          console.warn("[Chat Controller] markMessageDelivered: 0 rows updated, falling back to SELECT");
          const { data: existing } = await supabase
            .from("messages")
            .select("id, conversation_id, sender_id, delivered_at")
            .eq("id", messageId)
            .single();
          if (existing && existing.sender_id !== userId) {
            msgRow = existing;
            deliveredAt = existing.delivered_at || now;
          } else {
            return res.json({ success: true, note: "no-op" });
          }
        } else {
          throw error;
        }
      } else {
        msgRow = data;
      }

      if (!msgRow) return res.json({ success: true, note: "no-op" });

      const receiptPayload = { messageId, conversationId: msgRow.conversation_id, userId, delivered_at: deliveredAt };

      // Emit to conversation room (for ChatScreen listeners)
      await realtime.emitToConversation(msgRow.conversation_id, "chat:message_delivered", receiptPayload);
      // ALSO emit directly to the original sender so their ChatList updates too
      await realtime.emitToUser(msgRow.sender_id, "chat:message_delivered", receiptPayload);

      res.json({ success: true });
    } catch (updateErr) {
      console.warn("[Chat Controller] Failed to mark delivered:", updateErr.message);
      res.json({ success: true, error: "Feature unavailable" });
    }
  } catch (err) {
    console.error("Error marking message delivered:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.webhookDeliver = async (req, res) => {
  try {
    const { messageId } = req.params;

    const { data, error } = await supabase
      .from("messages")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", messageId)
      .is("delivered_at", null)
      .select()
      .single();

    if (!error && data) {
      await realtime.emitToConversation(data.conversation_id, "chat:message_delivered", {
        messageId,
        conversationId: data.conversation_id,
        userId: data.sender_id,
        delivered_at: data.delivered_at
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error in webhookDeliver:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    // FIX: Also read attachmentId and replyToId from body
    const { content, type, attachmentId, replyToId } = req.body;
    const userId = req.user.id;

    // Allow empty content when an attachment is present
    if (!content && !attachmentId) {
      return res.status(400).json({ error: "Content or attachment is required" });
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
    let createdMessageId = null;
    try {
      // Build payload conditionally — sending null for a non-existent column causes
      // a 42703 error just like sending a value. Only add these fields when present.
      const insertPayload = {
        conversation_id: conversationId,
        sender_id: userId,
        content: content || '',
        type: type || "text",
        sentiment,
        detected_language: detectedLang,
      };
      if (attachmentId) insertPayload.attachment_id = attachmentId;
      if (replyToId)    insertPayload.reply_to_id   = replyToId;

      // Stage 1: Insert the raw message to database
      let insertedMessage = null;
      const { data: insertData, error: insertError } = await supabase
        .from("messages")
        .insert([insertPayload])
        .select("id")
        .single();

      if (insertError) {
        // Fallback for missing columns (e.g. sentiment or language metadata)
        const isSchemaError = insertError.code === "42703" || insertError.code === "PGRST200" ||
          (insertError.message && (
            insertError.message.includes("sentiment") || 
            insertError.message.includes("detected_language") || 
            insertError.message.includes("attachment_id")
          ));

        if (isSchemaError) {
          console.warn("[Chat Controller] Schema mismatch on insert, retrying basic fallback insert:", insertError.code, insertError.message);
          const fallbackPayload = {
            conversation_id: conversationId,
            sender_id: userId,
            content: content || '',
            type: type || "text",
          };
          if (attachmentId) fallbackPayload.attachment_id = attachmentId;
          if (replyToId)    fallbackPayload.reply_to_id   = replyToId;

          const { data: retryData, error: retryErr } = await supabase
            .from("messages")
            .insert([fallbackPayload])
            .select("id")
            .single();

          if (retryErr) throw retryErr;
          insertedMessage = retryData;
        } else {
          throw insertError;
        }
      } else {
        insertedMessage = insertData;
      }

      createdMessageId = insertedMessage.id;

      // Stage 2: Hydrate the inserted message with all necessary joins (sender, attachment, etc.)
      const { data: hydratedMessage, error: hydrateError } = await supabase
        .from("messages")
        .select("*, attachment:media_attachments(*), sender:profiles(id, username, full_name, avatar_url), reply_to:messages(id, content, sender_id)")
        .eq("id", createdMessageId)
        .single();

      if (hydrateError) {
        console.warn("[Chat Controller] Failed to fully hydrate message on select, retrying simple select:", hydrateError.code, hydrateError.message);
        
        const { data: simpleMessage, error: simpleErr } = await supabase
          .from("messages")
          .select("*")
          .eq("id", createdMessageId)
          .single();

        if (simpleErr) throw simpleErr;
        
        // Hydrate sender details manually if the join itself failed
        try {
          const { data: senderData } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url")
            .eq("id", userId)
            .single();
          if (senderData) {
            simpleMessage.sender = senderData;
          }
        } catch (e) {
          console.warn("[Chat Controller] Manual profile hydration failed:", e);
        }

        processAfterMsg(simpleMessage);
      } else {
        processAfterMsg(hydratedMessage);
      }
    } catch (msgErr) {
      console.error("====================== CHAT ERROR TRACE ======================");
      console.error(msgErr.stack || msgErr);
      console.error("==============================================================");
      if (!res.headersSent) {
        return res.status(500).json({ error: msgErr.message || "Failed to send message", stack: msgErr.stack });
      }
    }

    async function processAfterMsg(msgToSend) {
      // 1. Respond to sender immediately to minimize perceived latency
      if (!res.headersSent) {
          res.json(msgToSend);
      }

      // 2. Broadcast to other members immediately
      await realtime.emitToConversation(conversationId, "chat:message", msgToSend);

      // 3. Background tasks (non-blocking)
      supabase.from("conversations").update({ updated_at: new Date() }).eq(
        "id",
        conversationId,
      ).then();
    }

    /**
     * Fire-and-forget native push via gateway /internal/push.
     * Called for each recipient so iOS/Android get APNs/FCM when offline.
     */
    function sendNativePush({ memberId, senderName, msgContent, msgId }) {
      try {
        const http = require('http');
        const https = require('https');
        const rawUrl = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5000';
        const targetUrl = new URL('/internal/push', rawUrl);
        const body = JSON.stringify({
          userId: memberId,
          title: senderName || 'New Message',
          body: (msgContent || '').substring(0, 100),
          payload: {
            type: 'chat_message',
            conversationId,
            messageId: msgId,
            url: `/dashboard/chat?id=${conversationId}`,
          },
        });
        const options = {
          hostname: targetUrl.hostname,
          port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
          path: targetUrl.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        };
        const lib = targetUrl.protocol === 'https:' ? https : http;
        const req2 = lib.request(options, (r) => r.resume());
        req2.on('error', (err) => console.warn('[Chat] sendNativePush error:', err.message));
        req2.write(body);
        req2.end();
      } catch (e) {
        console.warn('[Chat] sendNativePush setup error:', e.message);
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
            messageId: createdMessageId,
            conversationId: conversationId,
          });

          // ── Native Push (iOS APNs / Android FCM) ──────────────────────────
          // Fire-and-forget: sends to offline devices via the gateway push service.
          // This is the ONLY path that triggers sendChatPush for new messages.
          sendNativePush({
            memberId: member.user_id,
            senderName: sender?.username || 'New Message',
            msgContent: content,
            msgId: createdMessageId,
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

      if (conv?.chat_type === "support" && conv?.support_status !== "escalated" && conv?.support_status !== "resolved") {
        
        // Dynamically fetch a valid Admin user to satisfy foreign key constraints
        let botSenderId = "00000000-0000-0000-0000-000000000000";
        try {
           const { data: adminUser } = await supabase.from('profiles').select('id').eq('plan_tier', 'admin').limit(1).single();
           if (adminUser) {
              botSenderId = adminUser.id;
           } else {
              botSenderId = userId; // Fallback to prevent crash
           }
        } catch(e) { botSenderId = userId; }

        // === IMMEDIATELY emit typing indicator so user sees feedback ===
        await realtime.emitToConversation(conversationId, "chat:typing", { 
           conversationId, 
           userId: botSenderId, 
           isTyping: true 
        });

        const aiSupportService = require("../services/aiSupportService");
        
        if (aiSupportService.isConfigured()) {
          try {
            // AI Support Agent Logic — pass botSenderId for correct context
            const aiResponse = await aiSupportService.processSupportMessage(conversationId, content, userId, botSenderId);
            
            // Clear typing indicator
            await realtime.emitToConversation(conversationId, "chat:typing", { 
               conversationId, 
               userId: botSenderId, 
               isTyping: false 
            });

            if (aiResponse && aiResponse.text) {
              // Insert AI message
              const { data: autoMsg, error: autoErr } = await supabase
                .from("messages")
                .insert([{
                  conversation_id: conversationId,
                  sender_id: botSenderId,
                  content: aiResponse.text,
                  type: "text",
                }])
                .select()
                .single();

              if (!autoErr) {
                 await realtime.emitToConversation(conversationId, "chat:message", autoMsg);
              }
              
              // If escalated, update status
              if (aiResponse.isEscalated) {
                 await supabase
                  .from("conversations")
                  .update({ support_status: "escalated" })
                  .eq("id", conversationId);
              }
            } else {
              // AI returned no response — send a fallback so the user isn't left hanging
              const fallbackMsg = "Hi there! 👋 Thanks for reaching out. Our team has been notified and will get back to you shortly. – Note Standard Support Team";
              const { data: fallbackData, error: fallbackErr } = await supabase
                .from("messages")
                .insert([{
                  conversation_id: conversationId,
                  sender_id: botSenderId,
                  content: fallbackMsg,
                  type: "text",
                }])
                .select()
                .single();
              
              if (!fallbackErr) {
                 await realtime.emitToConversation(conversationId, "chat:message", fallbackData);
              }
            }
          } catch (aiErr) {
            console.error("[AI Support] Processing error:", aiErr.message);
            // Clear typing indicator on error
            await realtime.emitToConversation(conversationId, "chat:typing", { 
               conversationId, 
               userId: botSenderId, 
               isTyping: false 
            });

            // Send fallback message so user always gets a response
            const errorFallbackMsg = "Hi there! 👋 Thanks for your message. Our support team has been notified and will respond shortly. – Note Standard Support Team";
            try {
              const { data: errMsg, error: errMsgErr } = await supabase
                .from("messages")
                .insert([{
                  conversation_id: conversationId,
                  sender_id: botSenderId,
                  content: errorFallbackMsg,
                  type: "text",
                }])
                .select()
                .single();
              
              if (!errMsgErr) {
                 await realtime.emitToConversation(conversationId, "chat:message", errMsg);
              }
            } catch (fallbackInsertErr) {
              console.error("[AI Support] Even fallback message failed:", fallbackInsertErr.message);
            }
          }
        } else {
          // AI not configured — clear typing indicator
          await realtime.emitToConversation(conversationId, "chat:typing", { 
             conversationId, 
             userId: botSenderId, 
             isTyping: false 
          });

          // Original Offline Hours Fallback Logic
          const { data: settings } = await supabase
            .from("auto_reply_settings")
            .select("*")
            .single();

          if (settings?.enabled) {
            const now = new Date();
            const hours = now.getUTCHours();
            
            const parseHour = (h) => {
              if (typeof h === 'string' && h.includes(':')) {
                return parseInt(h.split(':')[0]);
              }
              return parseInt(h);
            };

            const start = parseHour(settings.start_hour);
            const end = parseHour(settings.end_hour);

            let isOffline = false;
            if (start > end) {
              isOffline = hours >= start || hours < end;
            } else {
              isOffline = hours >= start && hours < end;
            }

            if (isOffline) {
              const { data: autoMsg, error: autoErr } = await supabase
                .from("messages")
                .insert([{
                  conversation_id: conversationId,
                  sender_id: botSenderId,
                  content: settings.message,
                  type: "text",
                }])
                .select()
                .single();

              if (!autoErr) {
                 await realtime.emitToConversation(conversationId, "chat:message", autoMsg);
              }
            }
          }
        }
      }
    } catch (autoReplyErr) {
      console.error("Auto-reply logic failed:", autoReplyErr);
    }
  } catch (err) {
    console.error("Error sending message:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Server Error" });
    }
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

    // Notify admins via Gateway
    await realtime.emitToAdmin("chat:new_support_chat", {
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

    // Notify participants via Gateway
    await realtime.emitToConversation(conversationId, "chat:conversation_deleted", { conversationId });

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

    console.log(`[Chat Delete] Request by user ${userId} for message ${messageId}`);

    // Fetch message first to check sender and log status
    const { data: message, error: fetchError } = await supabase
      .from("messages")
      .select("id, sender_id, conversation_id")
      .eq("id", messageId)
      .maybeSingle();

    if (fetchError) {
      console.error(`[Chat Delete] Error fetching message ${messageId}:`, fetchError.message);
      throw fetchError;
    }

    if (!message) {
      console.warn(`[Chat Delete] Message ${messageId} not found in DB`);
      return res.status(404).json({ error: "Message not found" });
    }

    console.log(`[Chat Delete] Message found. Sender: ${message.sender_id}, Requester: ${userId}`);

    // Check requester role for admin bypass
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    const isAdmin = profile && ["admin", "support"].includes(profile.role);
    if (isAdmin) {
      console.log(`[Chat Delete] Admin/Support bypass enabled for user ${userId}`);
    }

    // Soft delete the message
    let query = supabase
      .from("messages")
      .update({
        is_deleted: true,
        content: "Message deleted", // Optional: scrub content
      })
      .eq("id", messageId);

    // If not admin, force ownership check
    if (!isAdmin) {
      query = query.eq("sender_id", userId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      // Check for 'No rows found' equivalent in supabase or missing permissions
      if (error.code === "PGRST116" || error.details?.includes('0 rows')) {
        console.warn(`[Chat Delete] Deletion failed. Record not found or RLS blocked it for user ${userId}`);
        return res.status(404).json({
          error: "Message not found or you don't have permission to delete it",
        });
      }
      throw error;
    }

    console.log(`[Chat Delete] Successfully soft-deleted message ${messageId}`);

    // Notify via Gateway
    await realtime.emitToConversation(data.conversation_id, "chat:message_deleted", {
      messageId,
      conversationId: data.conversation_id,
    });

    res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    console.error("Error deleting message:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

// Edit a specific message
exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content) {
       return res.status(400).json({ error: "Content is required" });
    }

    // Verify ownership and update the message
    const { data, error } = await supabase
      .from("messages")
      .update({
        content: content,
        is_edited: true,
      })
      .eq("id", messageId)
      .eq("sender_id", userId) // Force ownership
      .eq("is_deleted", false) // Cannot edit deleted messages
      .select("*, attachment:media_attachments(*)")
      .single();

    if (error) {
      if (error.code === "PGRST116" || error.details?.includes('0 rows')) {
        return res.status(404).json({
          error: "Message not found or you don't have permission to edit it",
        });
      }
      // if column is_edited doesn't exist yet, we attempt a fallback without it
      if (error.code === "42703" || error.code === "PGRST204") {
         console.warn("[Chat Controller] is_edited column missing, retrying without it");
         const { data: retryData, error: retryErr } = await supabase
           .from("messages")
           .update({ content: content })
           .eq("id", messageId)
           .eq("sender_id", userId)
           .eq("is_deleted", false)
           .select("*, attachment:media_attachments(*)")
           .single();
         if (retryErr) throw retryErr;
         
         await realtime.emitToConversation(retryData.conversation_id, "chat:message_edited", retryData);
         return res.json(retryData);
      }
      throw error;
    }

    // Notify via Gateway
    await realtime.emitToConversation(data.conversation_id, "chat:message_edited", data);

    res.json(data);
  } catch (err) {
    console.error("Error editing message:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.markConversationRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const now = new Date().toISOString();

    // Mark all messages in this conversation as read, except own
    const { error } = await supabase
      .from("messages")
      .update({ read_at: now, delivered_at: now }) // If read, it must have been delivered
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .is("read_at", null);

    if (error) {
      if (error.code === "42703") {
         return res.json({ success: true, note: "read_at column missing" });
      }
      throw error;
    }

    const readPayload = { conversationId, readerId: userId, readAt: now };

    // Emit to conversation room (for anyone in the ChatScreen)
    await realtime.emitToConversation(conversationId, "chat:conversation_read", readPayload);

    // CRITICAL FIX: Also emit directly to each other member via their personal user room
    // so their ChatList screen (which is NOT in the conversation room) receives the update.
    try {
      const { data: otherMembers } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", userId);

      for (const member of otherMembers || []) {
        await realtime.emitToUser(member.user_id, "chat:conversation_read", readPayload);
      }
    } catch (memberErr) {
      console.warn("[Chat Controller] Failed to emit read receipt to individual users:", memberErr.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error marking conversation read:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.markConversationDelivered = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const now = new Date().toISOString();

    // Mark all messages in this conversation as delivered, except own
    const { error } = await supabase
      .from("messages")
      .update({ delivered_at: now })
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .is("delivered_at", null);

    if (error) {
      if (error.code === "42703") {
         return res.json({ success: true, note: "delivered_at column missing" });
      }
      throw error;
    }

    const deliveredPayload = { conversationId, userId, delivered_at: now };

    // Emit to conversation room (for anyone in the ChatScreen)
    await realtime.emitToConversation(conversationId, "chat:conversation_delivered", deliveredPayload);

    // CRITICAL FIX: Also emit directly to each other member via their personal user room
    // so their ChatList screen (which is NOT in the conversation room) receives the update.
    try {
      const { data: otherMembers } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", userId);

      for (const member of otherMembers || []) {
        await realtime.emitToUser(member.user_id, "chat:conversation_delivered", deliveredPayload);
      }
    } catch (memberErr) {
      console.warn("[Chat Controller] Failed to emit delivered receipt to individual users:", memberErr.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error marking conversation delivered:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
};
