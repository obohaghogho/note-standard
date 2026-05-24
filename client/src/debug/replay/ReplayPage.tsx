import React, { useState } from "react";
import { useReplayDebugger } from "./useReplayDebugger";
import ReplayTimeline from "./ReplayTimeline";

export default function ReplayPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  const {
    data,
    loading,
    index,
    stepForward,
    stepBack
  } = useReplayDebugger(conversationId);

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: "#000", color: "#fff" }}>

      {/* LEFT CONTROL PANEL */}
      <div style={{ width: 320, padding: 20, borderRight: "1px solid #333", display: "flex", flexDirection: "column", gap: 15 }}>
        <h2>Replay Debugger</h2>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            placeholder="conversation_id"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            style={{ flex: 1, padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 4 }}
          />
          <button 
            onClick={() => setConversationId(inputValue)}
            style={{ padding: "8px 12px", background: "#333", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Load
          </button>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button 
            onClick={stepBack}
            style={{ flex: 1, padding: "8px", background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, cursor: "pointer" }}
          >⬅ Step</button>
          <button 
            onClick={stepForward}
            style={{ flex: 1, padding: "8px", background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, cursor: "pointer" }}
          >Step ➡</button>
        </div>

        {loading && <p style={{ color: "#888" }}>Loading replay...</p>}

        {data?.anomalies && data.anomalies.length > 0 && (
          <div style={{ marginTop: 20, color: "#ff4444", background: "#220000", padding: 10, borderRadius: 8 }}>
            <h4 style={{ margin: "0 0 10px 0" }}>Anomalies</h4>
            {data.anomalies.map((a, i) => (
              <div key={i} style={{ fontSize: 13, marginBottom: 5 }}>
                ⚠ {a.type} <br/>
                <span style={{ fontSize: 11, color: "#aaa" }}>Msg: {a.message_id} | Dev: {a.device_id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT TIMELINE VIEW */}
      <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
        {data && (
          <ReplayTimeline
            events={data.timeline}
            currentIndex={index}
          />
        )}
      </div>

    </div>
  );
}
