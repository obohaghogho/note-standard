const supabase = require('../../config/database');
const rankingService = require('./RankingService');
const recommendationService = require('./RecommendationService');
const analyticsService = require('./AnalyticsService');
const features = require('../../config/features');

/**
 * Feed Retrieval Service (V1)
 * Coordinates the Feed Pipeline: Eligibility -> Visibility -> Safety -> Ranking -> Personalization -> Diversification
 */
class FeedRetrievalService {
  
  async getFeed(req) {
    const { userId, tab = 'latest', cursor, limit = 20, category, sort, search } = req;
    
    // 1. Analytics tracking
    analyticsService.trackEvent(userId, 'feed_load', { tab, cursor: !!cursor });

    let rawPosts = [];

    // Parse composite cursor if provided
    const parsedCursor = rankingService.parseCursor(cursor);

    try {
      // 2. Retrieval (Eligibility & Visibility)
      // Note: In an enterprise system, retrieval just pulls candidates from an indexed pool.
      // Here we simulate it by pulling a large batch from DB, then processing in memory.
      
      // Handle special tabs that need different queries
      if (tab === 'following') {
        // Get posts from users the current user follows
        const { data: follows } = await supabase
          .from('community_follows')
          .select('following_id')
          .eq('follower_id', userId);
        const followingIds = (follows || []).map(f => f.following_id);
        if (followingIds.length === 0) return { posts: [], nextCursor: null, hasMore: false };
        let query = supabase
          .from('community_posts')
          .select('*, profiles!author_id(id, username, avatar_url, is_verified), community_likes(user_id), community_bookmarks(user_id)')
          .eq('status', 'public')
          .in('author_id', followingIds)
          .order('created_at', { ascending: false })
          .limit(limit + 1);
        if (parsedCursor) query = query.lt('created_at', parsedCursor.timestamp);
        const { data, error } = await query;
        if (error) throw error;
        const hasMore = (data || []).length > limit;
        return { posts: (data || []).slice(0, limit), hasMore, nextCursor: hasMore ? data[limit - 1]?.created_at : null };
      }

      if (tab === 'saved') {
        const { data: bookmarks } = await supabase
          .from('community_bookmarks')
          .select('post_id')
          .eq('user_id', userId);
        const postIds = (bookmarks || []).map(b => b.post_id);
        if (postIds.length === 0) return { posts: [], nextCursor: null, hasMore: false };
        const { data, error } = await supabase
          .from('community_posts')
          .select('*, profiles!author_id(id, username, avatar_url, is_verified), community_likes(user_id), community_bookmarks(user_id)')
          .eq('status', 'public')
          .in('id', postIds)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return { posts: data || [], hasMore: false, nextCursor: null };
      }

      if (tab === 'my-posts') {
        const { data, error } = await supabase
          .from('community_posts')
          .select('*, profiles!author_id(id, username, avatar_url, is_verified), community_likes(user_id), community_bookmarks(user_id)')
          .eq('author_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return { posts: data || [], hasMore: false, nextCursor: null };
      }

      let query = supabase
        .from('community_posts')
        .select('*, profiles!author_id(id, username, avatar_url, is_verified), community_likes(user_id), community_bookmarks(user_id)')
        .eq('status', 'public');

      // Category filter
      if (category && category !== 'All') {
        query = query.eq('category', category);
      }

      // Text search
      if (search && search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,content.ilike.%${search.trim()}%`);
      }

      if (parsedCursor && tab === 'latest') {
        query = query.lt('created_at', parsedCursor.timestamp);
      }
      
      // Sort
      if (sort === 'most_liked') {
        query = query.order('saves_count', { ascending: false });
      } else if (sort === 'most_commented') {
        query = query.order('shares_count', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query.limit(100);
        
      if (error) {
        if (error.code === '42P01') return { posts: [], nextCursor: null, hasMore: false };
        throw error;
      }
      
      rawPosts = data || [];

      // 3. Safety Filter (Placeholder for NSFW checks via Groq API)
      rawPosts = rawPosts.filter(post => !post.is_flagged);

      // 4. Ranking
      if (tab === 'trending') {
        rawPosts.forEach(post => {
          post._rankScore = rankingService.calculateScore(post);
        });
        
        // Sort by rank score descending
        rawPosts.sort((a, b) => b._rankScore - a._rankScore);
        
        // If cursor provided, filter out items already seen
        if (parsedCursor) {
           rawPosts = rawPosts.filter(post => post._rankScore < parsedCursor.score || 
              (post._rankScore === parsedCursor.score && new Date(post.created_at) < new Date(parsedCursor.timestamp))
           );
        }
      }

      // 5. Personalization & Diversification
      let finalFeed = [];
      let creatorCounts = {};
      let spaceCounts = {};

      for (const post of rawPosts) {
        if (finalFeed.length >= limit) break;

        // Diversity checks (Max 4 consecutive from same creator)
        const creatorId = post.author_id;
        if ((creatorCounts[creatorId] || 0) >= 4) continue;
        
        // Accept post
        finalFeed.push(post);
        creatorCounts[creatorId] = (creatorCounts[creatorId] || 0) + 1;
      }

      // 6. Exploration Injection (Inject 15% discovery if trending)
      if (tab === 'trending' && finalFeed.length > 5) {
        const discoveryCount = Math.max(1, Math.floor(limit * 0.15));
        const discoveryPosts = await recommendationService.getDiscoveryPosts(userId, discoveryCount);
        
        // Interleave discovery posts
        discoveryPosts.forEach((post, index) => {
          // Prevent duplicates
          if (!finalFeed.find(p => p.id === post.id)) {
             // Inject at roughly evenly spaced intervals
             const insertIdx = Math.min(finalFeed.length, (index + 1) * 4);
             post._isDiscovery = true; // Mark for UI styling
             finalFeed.splice(insertIdx, 0, post);
          }
        });
      }

      // Ensure limit is strictly met after injection
      finalFeed = finalFeed.slice(0, limit);

      // 7. Generate next cursor
      let nextCursor = null;
      if (finalFeed.length > 0) {
        const lastPost = finalFeed[finalFeed.length - 1];
        if (tab === 'trending') {
          nextCursor = rankingService.generateCursor(lastPost._rankScore || 0, lastPost.created_at, lastPost.id);
        } else {
          // Simple cursor for latest
          nextCursor = rankingService.generateCursor(0, lastPost.created_at, lastPost.id);
        }
      }

      // Strip internal _rankScore before sending to client, unless in diagnostics mode
      const isDiagnostics = features.DIAGNOSTICS_ENABLED;
      
      const cleanFeed = finalFeed.map(post => {
        const clean = { ...post };
        if (!isDiagnostics) {
          delete clean._rankScore;
        } else {
          clean.diagnostics = {
            rankScore: post._rankScore,
            isDiscovery: post._isDiscovery || false,
            reason: post._isDiscovery ? 'Exploration Algorithm' : 'Trending Score'
          };
        }
        return clean;
      });

      return {
        posts: cleanFeed,
        nextCursor,
        hasMore: rawPosts.length >= limit,
      };

    } catch (error) {
      console.error('[FeedRetrievalService] Feed generation failed:', error);
      // Implement Failover: Fallback to basic DB query
      return this.fallbackFeed(limit);
    }
  }

  async fallbackFeed(limit) {
    try {
       const { data } = await supabase
        .from('community_posts')
        .select('*, profiles!author_id(username, avatar_url)')
        .eq('status', 'public')
        .order('created_at', { ascending: false })
        .limit(limit);
        
       return { posts: data || [], nextCursor: null, isFallback: true };
    } catch (e) {
       return { posts: [], nextCursor: null, isFallback: true, error: true };
    }
  }
}

module.exports = new FeedRetrievalService();
