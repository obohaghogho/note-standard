export const LEASE_WAIT_TIMEOUT = 2000;

export async function ensureLeaseOwnership(
    conversationId: string, 
    sessionId: string, 
    deviceId: string,
    apiClient: any,
    getLocalLease: (conversationId: string) => { active_device_id?: string, active_session_id?: string } | undefined,
    markLeaseSynced?: (conversationId: string) => void
): Promise<boolean> {
    const lease = getLocalLease(conversationId);

    // Case 1: already active
    if (lease?.active_device_id === deviceId) {
        return true;
    }

    // Case 2: attempt takeover (RPC is source of truth)
    // We hit our Node.js API wrapper which calls the Postgres RPC `force_takeover_lease`
    try {
        await apiClient.post('/session/takeover', {
            conversationId,
            sessionId,
            deviceId,
        });
    } catch (e) {
        console.error('[LeaseBarrier] RPC takeover failed:', e);
        throw new Error("Lease takeover failed");
    }

    // IMPORTANT: DO NOT BLOCK ON WEBSOCKET CONFIRMATION
    // Since we don't have a direct promise for a single realtime event here without adding complex subscription logic,
    // we simply fire the RPC. The realtime listener in `useSessionArbitration` will eventually update the UI.
    // If the UI layer provided a markLeaseSynced callback (or we just mock the wait), we can call it optionally.
    if (markLeaseSynced) {
        // Optional UI sync only - resolve immediately
        setTimeout(() => markLeaseSynced(conversationId), 100);
    }

    return true;
}
