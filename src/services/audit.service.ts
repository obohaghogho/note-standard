// ============================================================================
// Audit Service
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActorType, AuditLog } from '@/types';

export interface AuditLogParams {
  actorId: string;
  actorType: ActorType;
  action: string;
  resourceType: string;
  resourceId: string;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  constructor(private readonly supabase: SupabaseClient) {}

  /** Log an audit event (immutable — insert only) */
  async log(params: AuditLogParams): Promise<void> {
    const { error } = await this.supabase.from('audit_logs').insert({
      actor_id: params.actorId,
      actor_type: params.actorType,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      changes: params.changes ?? {},
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
      metadata: params.metadata ?? {},
    });

    if (error) {
      // Audit failures should never break operations — log and continue
      console.error('[AuditService] Failed to log audit event:', error.message);
    }
  }

  /** Query audit logs by resource */
  async getByResource(
    resourceType: string,
    resourceId: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    const { data, error } = await this.supabase
      .from('audit_logs')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to query audit logs: ${error.message}`);
    return (data ?? []) as AuditLog[];
  }

  /** Query audit logs by actor */
  async getByActor(actorId: string, limit = 50): Promise<AuditLog[]> {
    const { data, error } = await this.supabase
      .from('audit_logs')
      .select('*')
      .eq('actor_id', actorId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to query audit logs: ${error.message}`);
    return (data ?? []) as AuditLog[];
  }
}
