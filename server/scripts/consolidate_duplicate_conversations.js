const supabase = require('../config/database');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("=== STEP 1: APPLY MIGRATION 211 ===");
  const sqlPath = path.join(__dirname, '../database/migrations/211_fix_rpc_get_conversations_and_dupes.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  try {
    const { error: rpcExecErr } = await supabase.rpc('exec_sql', { sql_query: sqlContent });
    if (rpcExecErr) {
      console.warn("Could not execute via exec_sql RPC (may require direct SQL execution):", rpcExecErr.message);
    } else {
      console.log("Migration 211 applied successfully via exec_sql!");
    }
  } catch (e) {
    console.warn("Migration execution notice:", e.message);
  }

  console.log("\n=== STEP 2: CONSOLIDATE DUPLICATE DIRECT CONVERSATIONS ===");
  
  // 1. Fetch all direct conversations that are user chats
  const { data: directConvs, error: cErr } = await supabase
    .from('conversations')
    .select('id, chat_type, created_at, updated_at, last_message_at')
    .eq('type', 'direct');

  if (cErr) {
    console.error("Error fetching conversations:", cErr);
    return;
  }

  const directIds = directConvs.map(c => c.id);

  // 2. Fetch all memberships
  const { data: members, error: mErr } = await supabase
    .from('conversation_members')
    .select('conversation_id, user_id, is_deleted, cleared_at')
    .in('conversation_id', directIds);

  if (mErr) {
    console.error("Error fetching members:", mErr);
    return;
  }

  // Group members by conversation_id
  const convMap = {};
  members.forEach(m => {
    if (!convMap[m.conversation_id]) convMap[m.conversation_id] = [];
    convMap[m.conversation_id].push(m);
  });

  // Group direct user-to-user conversation pairs
  const pairMap = {};

  for (const [convId, mList] of Object.entries(convMap)) {
    if (mList.length === 2) {
      const convDetail = directConvs.find(c => c.id === convId);
      // Skip support chats
      if (convDetail && convDetail.chat_type === 'support') continue;

      const userIds = mList.map(m => m.user_id).sort();
      const pairKey = userIds.join(':');
      if (!pairMap[pairKey]) pairMap[pairKey] = [];
      pairMap[pairKey].push({
        convId,
        convDetails: convDetail,
        members: mList
      });
    }
  }

  const duplicates = Object.entries(pairMap).filter(([k, list]) => list.length > 1);

  console.log(`Found ${duplicates.length} user pairs with duplicate direct conversations.`);

  for (const [pairKey, list] of duplicates) {
    const [u1, u2] = pairKey.split(':');
    const { data: p1 } = await supabase.from('profiles').select('username').eq('id', u1).single();
    const { data: p2 } = await supabase.from('profiles').select('username').eq('id', u2).single();

    console.log(`\nConsolidating Pair: ${p1?.username || u1} <-> ${p2?.username || u2} (${list.length} conversations)`);

    // Fetch message count & newest message date for each duplicate conversation
    const enrichedList = await Promise.all(list.map(async item => {
      const { count: msgCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', item.convId);

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('conversation_id', item.convId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...item,
        msgCount: msgCount || 0,
        lastMsgTime: lastMsg ? new Date(lastMsg.created_at).getTime() : 0
      };
    }));

    // Sort to pick the primary canonical conversation:
    // 1. Highest message count
    // 2. Most recent message time
    // 3. Earliest creation time
    enrichedList.sort((a, b) => {
      if (b.msgCount !== a.msgCount) return b.msgCount - a.msgCount;
      if (b.lastMsgTime !== a.lastMsgTime) return b.lastMsgTime - a.lastMsgTime;
      return new Date(a.convDetails?.created_at || 0) - new Date(b.convDetails?.created_at || 0);
    });

    const primaryConv = enrichedList[0];
    const secondaryConvs = enrichedList.slice(1);

    console.log(`  => Selected PRIMARY Conversation: ${primaryConv.convId} (msgCount: ${primaryConv.msgCount})`);

    for (const sec of secondaryConvs) {
      console.log(`  => Consolidating SECONDARY Conversation: ${sec.convId} (msgCount: ${sec.msgCount})`);

      // Reassign all messages from secondary to primary
      if (sec.msgCount > 0) {
        const { error: reassignErr } = await supabase
          .from('messages')
          .update({ conversation_id: primaryConv.convId })
          .eq('conversation_id', sec.convId);

        if (reassignErr) {
          console.error(`  [!] Error reassigning messages from ${sec.convId}:`, reassignErr.message);
        } else {
          console.log(`  [+] Reassigned ${sec.msgCount} messages to primary ${primaryConv.convId}`);
        }
      }

      // Delete secondary conversation members and conversation
      await supabase.from('conversation_members').delete().eq('conversation_id', sec.convId);
      await supabase.from('conversations').delete().eq('id', sec.convId);
      console.log(`  [+] Removed duplicate conversation ${sec.convId}`);
    }

    // Ensure primary conversation members have is_deleted = false
    await supabase
      .from('conversation_members')
      .update({ is_deleted: false, deleted_at: null })
      .eq('conversation_id', primaryConv.convId);

    // Update primary conversation last_message_id and last_message_at
    const { data: latestMsg } = await supabase
      .from('messages')
      .select('id, created_at')
      .eq('conversation_id', primaryConv.convId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMsg) {
      await supabase
        .from('conversations')
        .update({
          last_message_id: latestMsg.id,
          last_message_at: latestMsg.created_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', primaryConv.convId);
      console.log(`  [+] Updated primary ${primaryConv.convId} last_message pointer to ${latestMsg.id}`);
    }
  }

  console.log("\n=== CONSOLIDATION COMPLETED SUCCESSFULLY ===");
}

main().catch(console.error);
