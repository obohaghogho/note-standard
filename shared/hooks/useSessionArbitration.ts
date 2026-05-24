import { useEffect, useState, useCallback, useRef } from "react";

interface Lease {
    active_device_id: string;
    active_session_id: string;
    last_heartbeat_at?: string;
    last_writer_event_id?: string;
}

interface UseSessionArbitrationProps {
    sessionId: string | null;
    deviceId: string | null;
    supabase: any;
    initialConversations?: Array<{ id: string; active_session_id?: string; active_device_id?: string }>;
}

export function useSessionArbitration({
    sessionId,
    deviceId,
    supabase,
    initialConversations = []
}: UseSessionArbitrationProps) {
    const [leases, setLeases] = useState<Record<string, Lease>>({});
    const [claimingLeases, setClaimingLeases] = useState<Record<string, boolean>>({});
    
    // Stabilize rapid toggles
    const stabilityTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

    // Initialize leases from REST hydration
    useEffect(() => {
        if (initialConversations.length > 0) {
            setLeases(prev => {
                const updated = { ...prev };
                let hasChanges = false;
                initialConversations.forEach(conv => {
                    if (conv.active_session_id && conv.active_device_id) {
                        updated[conv.id] = {
                            active_session_id: conv.active_session_id,
                            active_device_id: conv.active_device_id
                        };
                        hasChanges = true;
                    }
                });
                return hasChanges ? updated : prev;
            });
        }
    }, [initialConversations]);

    const isActiveWriter = useCallback((conversationId: string) => {
        if (!sessionId) return false;
        const lease = leases[conversationId];
        if (!lease) return true; // Default to true if unknown, will correct upon first hydration
        return lease.active_session_id === sessionId;
    }, [leases, sessionId]);

    const isClaimingLease = useCallback((conversationId: string) => {
        return !!claimingLeases[conversationId];
    }, [claimingLeases]);

    const markLeaseClaimStart = useCallback((conversationId: string) => {
        setClaimingLeases(prev => ({ ...prev, [conversationId]: true }));
    }, []);

    const markLeaseClaimEnd = useCallback((conversationId: string) => {
        setClaimingLeases(prev => ({ ...prev, [conversationId]: false }));
    }, []);

    useEffect(() => {
        if (!supabase) return;

        const channel = supabase
            .channel("lease_updates")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "conversation_leases"
                },
                (payload: any) => {
                    const lease = payload.new;
                    if (!lease || !lease.conversation_id) return;

                    const convId = lease.conversation_id;

                    // Clear any claiming state if the server acknowledged a lease change
                    markLeaseClaimEnd(convId);

                    // Debounce stability window to ignore rapid toggles
                    if (stabilityTimeoutRef.current[convId]) {
                        clearTimeout(stabilityTimeoutRef.current[convId]);
                    }

                    stabilityTimeoutRef.current[convId] = setTimeout(() => {
                        setLeases((prev) => ({
                            ...prev,
                            [convId]: {
                                active_session_id: lease.active_session_id,
                                active_device_id: lease.active_device_id,
                                last_heartbeat_at: lease.last_heartbeat_at,
                                last_writer_event_id: lease.last_writer_event_id
                            }
                        }));
                    }, 1200); // 1200ms stability window
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            // Cleanup timeouts
            Object.values(stabilityTimeoutRef.current).forEach(t => clearTimeout(t));
        };
    }, [supabase, markLeaseClaimEnd]);

    return {
        leases,
        isActiveWriter,
        isClaimingLease,
        markLeaseClaimStart,
        markLeaseClaimEnd
    };
}
