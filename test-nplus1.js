const supabase = require('./server/config/database');

async function testNPlusOne() {
    const { data: users } = await supabase.from('profiles').select('id').limit(1);
    if (!users || !users.length) return;
    const userId = users[0].id;
    console.log("Testing N+1 fallback for user", userId);

    let memberships = [];
    try {
      const { data: mData, error: mError } = await supabase
        .from("conversation_members")
        .select("conversation_id, role, status, cleared_at")
        .eq("user_id", userId);
      if (mError) throw mError;
      memberships = mData || [];
    } catch (e) {
      console.log("Error 1", e);
      return;
    }

    if (memberships.length === 0) {
        console.log("No memberships");
        return;
    }

    const conversationIds = memberships.map(m => m.conversation_id);
    console.log("Conv IDs:", conversationIds);

    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", conversationIds);

    if (convError) {
        console.log("Error 2", convError);
        return;
    }

    let userBlocks = [];
    try {
      const { data: blocks } = await supabase
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
      userBlocks = blocks || [];
    } catch (e) { /* ignore block fetch error */ }

    const enriched = await Promise.all(conversations.map(async (conv) => {
      try {
        const membership = memberships.find(m => m.conversation_id === conv.id);

        const { data: members, error: memErr } = await supabase
          .from("conversation_members")
          .select(`user_id, role, status, profile:profiles (
            id, username, full_name, avatar_url, is_verified,
            plan_tier, is_online, show_online_status, last_seen
          )`)
          .eq("conversation_id", conv.id);

        if (memErr) console.log("Mem error:", memErr);

        const { data: lastMsgs, error: lastMsgErr } = await supabase
          .from("messages")
          .select("id, content, sender_id, created_at, type, read_at, delivered_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (lastMsgErr) console.log("Last msg error:", lastMsgErr);

        let unreadCount = 0;
        try {
          const { count, error: countErr } = await supabase
            .from("messages")
            .select("*", { count: 'exact', head: true })
            .eq("conversation_id", conv.id)
            .neq("sender_id", userId)
            .is("read_at", null);
          if (countErr) console.log("Count error:", countErr);
          unreadCount = count || 0;
        } catch (e) { /* ignore unread count error */ }

        return {
          ...conv,
          unreadCount,
          membership: {
            role: membership?.role || "member",
            status: membership?.status || "accepted",
            cleared_at: membership?.cleared_at || null,
            joined_at: null
          },
          members: members || [],
          last_message: lastMsgs?.[0] || null,
        };
      } catch (e) {
        console.error(`[Chat] Enrichment failed for conv ${conv.id}:`, e.message);
        return { ...conv, members: [], last_message: null, unreadCount: 0 };
      }
    }));

    console.log("Enriched Data Type:", typeof enriched, Array.isArray(enriched));
    console.log("Enriched Data Length:", enriched.length);
    console.log("Sample:", enriched[0]);
}

testNPlusOne();
