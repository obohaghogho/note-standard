const supabase = require('../../config/database');
const eventBus = require('../eventBus');

/**
 * Analytics Service
 * Tracks deep feed metrics. Communicates via EventBus to avoid blocking the main thread.
 */
class AnalyticsService {
  constructor() {
    this.initListeners();
  }

  initListeners() {
    eventBus.on('feed_analytics_event', this.handleAnalyticsEvent.bind(this));
  }

  async handleAnalyticsEvent(payload) {
    try {
      const { user_id, event_type, metadata } = payload;
      
      // In production, this would ideally write to a fast timeseries DB (like ClickHouse or Redis)
      // For V1, we log it to user_activity_log for simplicity, but tag it specifically.
      
      await supabase
        .from('user_activity_log')
        .insert({
          user_id,
          action_type: `analytics_${event_type}`, // e.g., analytics_feed_load, analytics_scroll_depth
          metadata: metadata
        });
        
    } catch (error) {
      console.error('[AnalyticsService] Error processing event:', error);
    }
  }

  // Public method for synchronous tracking if absolutely needed
  trackEvent(userId, eventType, metadata = {}) {
    eventBus.emit('feed_analytics_event', { user_id: userId, event_type: eventType, metadata });
  }
}

module.exports = new AnalyticsService();
