/**
 * Recommendation Service
 * Responsible for injecting discovery and personalization into the feed.
 */
const supabase = require('../../config/database');

class RecommendationService {
  
  /**
   * Retrieves recommended tags or categories for a user based on past activity.
   */
  async getUserPreferences(userId) {
    // Phase 1 implementation: Fetch from activity service or user profile
    // In future phases, this pulls from the AI Feature Vector store
    return {
      preferredTags: ['technology', 'productivity'],
      preferredSpaces: [],
      avoidCreators: []
    };
  }

  /**
   * Explores new content. Returns a diverse set of posts outside the user's normal bubble.
   */
  async getDiscoveryPosts(userId, limit = 3) {
    try {
      // Find high-quality posts from creators the user DOES NOT follow
      // For V1, we'll approximate this by grabbing random high-ranking public posts
      
      const { data, error } = await supabase
        .from('community_posts')
        .select('*, profiles!author_id(username, avatar_url, is_verified)')
        .eq('status', 'public')
        .order('views_count', { ascending: false })
        .limit(limit * 2); // Fetch extra to filter
        
      if (error) throw error;
      
      // Shuffle and slice
      return (data || []).sort(() => 0.5 - Math.random()).slice(0, limit);
    } catch (err) {
      console.error('[RecommendationService] Error fetching discovery posts:', err);
      return [];
    }
  }
}

module.exports = new RecommendationService();
