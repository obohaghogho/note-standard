const supabase = require('../../config/database');

class OperationsService {

  /**
   * Aggregate real-time health metrics.
   * This is intended to run on a cron (e.g., every 5 mins) and be queryable by the dashboard.
   */
  async recordHealthSnapshot() {
    // 1. Fetch live metrics (Mocked logic for aggregation, normally from APM/Redis)
    const activeConnections = 142; // Placeholder for DB connections
    const queueDepth = await this._getQueueDepth();
    const { dlqCount, failedCount } = await this._getJobFailures();

    const snapshot = {
      measured_at: new Date().toISOString(),
      
      // API (Would be fetched from Prometheus or Pino aggregated logs)
      avg_api_latency_ms: 110,
      p95_api_latency_ms: 220,
      error_rate_pct: 0.5,
      
      // Database
      active_connections: activeConnections,
      cache_hit_rate_pct: 88.5,
      avg_query_latency_ms: 15,
      
      // AI
      avg_ai_latency_ms: 1800,
      ai_timeout_rate_pct: 0.1,
      ai_token_usage_total: 450000,
      
      // Queues
      pending_jobs_count: queueDepth,
      failed_jobs_count: failedCount,
      dlq_count: dlqCount,
      avg_job_processing_ms: 450
    };

    const { error } = await supabase.from('system_health_metrics').insert(snapshot);
    if (error) console.error('Failed to record health snapshot', error);
    
    return snapshot;
  }

  async getLatestHealth() {
    const { data } = await supabase
      .from('system_health_metrics')
      .select('*')
      .order('measured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    return data || {};
  }
  
  async getHealthHistory(hours = 24) {
    const { data } = await supabase
      .from('system_health_metrics')
      .select('*')
      .gte('measured_at', new Date(Date.now() - hours * 3600000).toISOString())
      .order('measured_at', { ascending: true });
      
    return data || [];
  }

  // --- Feature Flags ---

  async getFeatureFlags() {
    const { data } = await supabase.from('platform_feature_flags').select('*').order('flag_key');
    return data || [];
  }

  async toggleFeatureFlag(flagKey, isEnabled, adminId) {
    const { data, error } = await supabase
      .from('platform_feature_flags')
      .update({ is_enabled: isEnabled, updated_at: new Date().toISOString(), updated_by: adminId })
      .eq('flag_key', flagKey)
      .select()
      .single();

    if (error) throw error;
    
    // Log audit
    await this.logAdminAction(adminId, 'toggle_feature_flag', flagKey, 'feature_flag', { isEnabled });
    return data;
  }

  // --- Audit Logging ---
  
  async logAdminAction(adminId, action, targetId, targetType, metadata = {}) {
    await supabase.from('admin_audit_logs').insert({
      admin_id: adminId,
      action,
      target_id: targetId,
      target_type: targetType,
      metadata
    });
  }

  // --- Internal Stubs ---
  
  async _getQueueDepth() {
    // Stub: Would integrate with BullMQ or similar
    return Math.floor(Math.random() * 50); 
  }
  
  async _getJobFailures() {
    // Stub
    return { dlqCount: Math.floor(Math.random() * 5), failedCount: 0 };
  }
}

module.exports = new OperationsService();
