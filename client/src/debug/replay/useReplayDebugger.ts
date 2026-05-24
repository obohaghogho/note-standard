import { useEffect, useState } from "react";
import { ReplayResponse } from "./replayTypes";
import api from "../../services/api";

export function useReplayDebugger(conversationId: string | null) {
  const [data, setData] = useState<ReplayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!conversationId) return;

    setLoading(true);

    api.get(`/debug/replay/${conversationId}`)
      .then(res => {
        setData(res.data);
        setIndex(0);
      })
      .catch(err => {
        console.error("Failed to load replay:", err);
      })
      .finally(() => setLoading(false));
  }, [conversationId]);

  const stepForward = () => {
    if (!data) return;
    setIndex(i => Math.min(i + 1, data.timeline.length));
  };

  const stepBack = () => {
    setIndex(i => Math.max(i - 1, 0));
  };

  return {
    data,
    loading,
    index,
    stepForward,
    stepBack
  };
}
