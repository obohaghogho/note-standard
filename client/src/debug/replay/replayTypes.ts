export type ReplayEvent = {
  id: string;
  event_type: "SENT" | "DELIVERED" | "READ" | "LEASE_TAKEN";
  message_id: string;
  conversation_id: string;
  device_id: string;
  correlation_id?: string;
  created_at: string;
};

export type ReplayResponse = {
  conversation_id: string;
  final_state: any;
  timeline: ReplayEvent[];
  anomalies: {
    type: string;
    message_id?: string;
    device_id?: string;
  }[];
};
