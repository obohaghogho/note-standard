export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export const STATUS_RANK: Record<MessageStatus, number> = {
    failed: -1,
    sending: 0,
    sent: 1,
    delivered: 2,
    read: 3,
};

export interface StatusTransitionTelemetry {
    messageId?: string;
    eventId?: string;
    previousStatus: string;
    incomingStatus: string;
    appliedStatus: string;
    source: 'http' | 'socket' | 'push' | 'db_sync' | 'read' | 'early_ack_reconciliation';
    timestamp: string;
}

export function isMonotonicUpgrade(currentStatus?: string, incomingStatus?: string): boolean {
    const currentRank = STATUS_RANK[(currentStatus as MessageStatus) || 'sending'] ?? 0;
    const incomingRank = STATUS_RANK[(incomingStatus as MessageStatus) || 'sending'] ?? 0;
    return incomingRank > currentRank;
}

export function deriveStatusFromTimestamps(
    read_at?: string | null,
    delivered_at?: string | null,
    isPersisted?: boolean,
    currentStatus?: string
): MessageStatus {
    if (read_at) return 'read';
    if (delivered_at) return 'delivered';
    if (isPersisted) {
        if (currentStatus === 'read') return 'read';
        if (currentStatus === 'delivered') return 'delivered';
        return 'sent';
    }
    return (currentStatus as MessageStatus) || 'sending';
}

export function mergeMessageMonotonic<T extends {
    id: string;
    event_id?: string;
    status?: MessageStatus | string;
    delivered_at?: string | null;
    read_at?: string | null;
}>(
    existing: T,
    incoming: Partial<T> & { status?: MessageStatus | string; delivered_at?: string | null; read_at?: string | null },
    source: StatusTransitionTelemetry['source'] = 'http'
): { merged: T; telemetry: StatusTransitionTelemetry | null } {
    const prevStatus = (existing.status as MessageStatus) || deriveStatusFromTimestamps(existing.read_at, existing.delivered_at, !existing.id.startsWith('temp-'), 'sending');

    // Combine timestamps monoticially
    const finalReadAt = incoming.read_at || existing.read_at || null;
    const finalDeliveredAt = incoming.delivered_at || existing.delivered_at || (finalReadAt ? finalReadAt : null);

    // Compute status derived from timestamps
    let targetStatus = deriveStatusFromTimestamps(finalReadAt, finalDeliveredAt, !existing.id.startsWith('temp-') && !(incoming.id && incoming.id.startsWith('temp-')), incoming.status || prevStatus);

    // Enforce strict rank monotonicity
    const prevRank = STATUS_RANK[prevStatus as MessageStatus] ?? 0;
    const targetRank = STATUS_RANK[targetStatus as MessageStatus] ?? 0;

    let appliedStatus: MessageStatus = prevStatus;
    if (targetRank >= prevRank) {
        appliedStatus = targetStatus;
    } else {
        appliedStatus = prevStatus; // MONOTONIC GUARD: Reject downgrade
    }

    const merged: T = {
        ...existing,
        ...incoming,
        id: (incoming.id && !incoming.id.startsWith('temp-')) ? incoming.id : existing.id,
        event_id: incoming.event_id || existing.event_id,
        read_at: finalReadAt || undefined,
        delivered_at: finalDeliveredAt || undefined,
        status: appliedStatus,
    };

    const telemetry: StatusTransitionTelemetry | null = (prevStatus !== appliedStatus || source === 'early_ack_reconciliation') ? {
        messageId: merged.id,
        eventId: merged.event_id,
        previousStatus: prevStatus,
        incomingStatus: incoming.status || 'unknown',
        appliedStatus,
        source,
        timestamp: new Date().toISOString(),
    } : null;

    if (telemetry) {
        console.log(`[STATUS_TELEMETRY] ${telemetry.source} | msg:${telemetry.messageId} | evt:${telemetry.eventId} | ${telemetry.previousStatus} -> ${telemetry.appliedStatus}`);
    }

    return { merged, telemetry };
}

/**
 * Correlation Registry to handle early ACKs before HTTP response
 */
export class CorrelationRegistry {
    private eventToTemp = new Map<string, string>(); // event_id -> tempId
    private messageToEvent = new Map<string, string>(); // messageId -> event_id
    private pendingStatuses = new Map<string, { status: MessageStatus; delivered_at?: string; read_at?: string; timestamp: string }>();

    public registerOptimistic(tempId: string, eventId: string): void {
        if (eventId && tempId) {
            this.eventToTemp.set(eventId, tempId);
        }
    }

    public registerServerId(messageId: string, eventId: string): void {
        if (messageId && eventId) {
            this.messageToEvent.set(messageId, eventId);
        }
    }

    public recordEarlyAck(key: string, status: MessageStatus, delivered_at?: string, read_at?: string): void {
        if (!key) return;
        const existing = this.pendingStatuses.get(key);
        const currentRank = STATUS_RANK[existing?.status || 'sending'] ?? 0;
        const incomingRank = STATUS_RANK[status] ?? 0;

        if (incomingRank >= currentRank) {
            this.pendingStatuses.set(key, {
                status,
                delivered_at: delivered_at || existing?.delivered_at,
                read_at: read_at || existing?.read_at,
                timestamp: new Date().toISOString(),
            });
        }
    }

    public getPendingAck(key: string): { status: MessageStatus; delivered_at?: string; read_at?: string } | undefined {
        if (!key) return undefined;
        return this.pendingStatuses.get(key);
    }

    public resolveTempId(key: string): string | undefined {
        if (!key) return undefined;
        if (this.eventToTemp.has(key)) return this.eventToTemp.get(key);
        const eventId = this.messageToEvent.get(key);
        if (eventId && this.eventToTemp.has(eventId)) {
            return this.eventToTemp.get(eventId);
        }
        return undefined;
    }

    public resolveEventId(key: string): string | undefined {
        if (!key) return undefined;
        if (this.messageToEvent.has(key)) return this.messageToEvent.get(key);
        return undefined;
    }
}

export const correlationRegistry = new CorrelationRegistry();
