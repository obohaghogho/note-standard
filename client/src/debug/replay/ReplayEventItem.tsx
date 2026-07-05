import React from "react";
import { ReplayEvent } from "./replayTypes";

export default function ReplayEventItem({ event }: { event: ReplayEvent }) {
  const colorMap = {
    SENT: "#4caf50",
    DELIVERED: "#2196f3",
    READ: "#9c27b0",
    LEASE_TAKEN: "#ff9800"
  };

  return (
    <div
      style={{
        padding: 8,
        borderLeft: `4px solid ${colorMap[event.event_type] || "#ffffff"}`,
        marginBottom: 6,
        color: "white" // Ensure text is visible
      }}
    >
      <strong>{event.event_type}</strong>
      <div>{event.message_id}</div>
    </div>
  );
}
