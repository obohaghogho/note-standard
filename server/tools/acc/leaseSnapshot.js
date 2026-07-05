async function getLeaseSnapshot(conversationId, supabase) {
  const { data } = await supabase
    .from("conversation_leases")
    .select("active_session_id, active_device_id, last_heartbeat_at")
    .eq("conversation_id", conversationId)
    .single();

  return data;
}

module.exports = { getLeaseSnapshot };
