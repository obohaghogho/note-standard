import React from "react";
import type { ReplayEvent } from "./replayTypes";

export default function ReplayTimeline({
  events,
  currentIndex
}: {
  events: ReplayEvent[];
  currentIndex: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {events.map((event, idx) => {

        const isActive = idx === currentIndex;
        const isPast = idx < currentIndex;

        return (
          <div
            key={event.id}
            style={{
              padding: 10,
              borderRadius: 8,
              border: isActive
                ? "2px solid #00ff99"
                : "1px solid #333",
              background: isPast
                ? "#111"
                : "#0a0a0a",
              opacity: isPast ? 0.6 : 1,
              color: "white" // Ensure text is visible in dark mode
            }}
          >
            <strong>{event.event_type}</strong>
            <div>msg: {event.message_id}</div>
            <div>device: {event.device_id}</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              {event.created_at}
            </div>
          </div>
        );
      })}
    </div>
  );
}
