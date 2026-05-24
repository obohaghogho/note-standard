async function executeChaosTest({ baseUrl, conversationId }) {
  const res = await fetch(`${baseUrl}/api/debug/chaos/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: conversationId,
      level: 2   // CI ALWAYS uses Level 2 minimum
    })
  });

  return await res.json();
}

module.exports = { executeChaosTest };
