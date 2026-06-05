export const LEASE_WAIT_TIMEOUT = 2000;

// ── In-memory lease ownership cache ────────────────────────────────────────
// After a successful takeover, we cache the result for 30 seconds so that
// rapid message sends don't each trigger a separate RPC call.
// Key: conversationId | Value: expiry timestamp (ms)
const _leaseCache = new Map<string, number>();
const LEASE_CACHE_TTL_MS = 30_000;

function _isCacheValid(conversationId: string): boolean {
    const expiry = _leaseCache.get(conversationId);
    if (!expiry) return false;
    if (Date.now() > expiry) {
        _leaseCache.delete(conversationId);
        return false;
    }
    return true;
}

export function invalidateLeaseCache(conversationId: string): void {
    _leaseCache.delete(conversationId);
}
// ───────────────────────────────────────────────────────────────────────────

export async function ensureLeaseOwnership(
    conversationId: string, 
    sessionId: string, 
    deviceId: string,
    apiClient: any,
    getLocalLease: (conversationId: string) => { active_device_id?: string, active_session_id?: string } | undefined,
    markLeaseSynced?: (conversationId: string) => void
): Promise<boolean> {
    const lease = getLocalLease(conversationId);

    // Case 1: already active (local state confirms ownership)
    if (lease?.active_device_id === deviceId) {
        // Refresh cache to extend TTL on confirmed ownership
        _leaseCache.set(conversationId, Date.now() + LEASE_CACHE_TTL_MS);
        return true;
    }

    // Case 1b: local state not yet synced but we have a fresh cache entry
    // (e.g. takeover just happened, heartbeat hasn't propagated yet)
    if (_isCacheValid(conversationId)) {
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

        // Cache the successful takeover
        _leaseCache.set(conversationId, Date.now() + LEASE_CACHE_TTL_MS);
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
