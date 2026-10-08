const supabase = require('../../config/database');
const graphService = require('../graph/GraphService');

class CreatorAnalyticsService {

  // ─── Consolidated Creator Studio Dashboard ────────────────
  async getConsolidatedDashboard(creatorId, period = '30d') {
    // 1. Fetch Creator Identity & Mode Profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('is_creator, creator_mode_enabled, creator_category, creator_onboarded_at, social_links')
      .eq('id', creatorId)
      .maybeSingle();

    if (profileErr || !profile) {
      const err = new Error('Creator profile not found');
      err.status = 404;
      throw err;
    }

    const isCreator = profile.is_creator === true;
    const modeEnabled = profile.creator_mode_enabled === true;

    // State A: Not a creator identity
    if (!isCreator && !modeEnabled) {
      return {
        success: true,
        mode_status: 'not_creator',
        creator_profile: {
          is_creator: false,
          creator_mode_enabled: false,
          creator_category: profile.creator_category || null,
          creator_onboarded_at: profile.creator_onboarded_at || null,
          social_links: profile.social_links || {}
        }
      };
    }

    // State B: Is a creator, but workspace mode disabled
    if (isCreator && !modeEnabled) {
      return {
        success: true,
        mode_status: 'mode_disabled',
        creator_profile: {
          is_creator: true,
          creator_mode_enabled: false,
          creator_category: profile.creator_category || null,
          creator_onboarded_at: profile.creator_onboarded_at || null,
          social_links: profile.social_links || {}
        }
      };
    }

    // State C: Active Creator Workspace
    // Period contract validation (7d, 30d, 90d)
    let numDays = 30;
    if (period === '7d') numDays = 7;
    else if (period === '90d') numDays = 90;
    else numDays = 30;

    const periodStr = `${numDays}d`;
    const startDateObj = new Date(Date.now() - numDays * 86400000);
    const startDateStr = startDateObj.toISOString().split('T')[0];
    const startDateISO = startDateObj.toISOString();

    // Fetch author's Reels
    const { data: reels, error: reelsErr } = await supabase
      .from('community_posts')
      .select('id, content, post_type, is_reel, media_urls, video_duration, views_count, created_at')
      .eq('author_id', creatorId)
      .or('is_reel.eq.true,post_type.eq.reel,post_type.eq.video')
      .order('views_count', { ascending: false });

    if (reelsErr) throw reelsErr;
    const creatorReels = reels || [];
    const reelIds = creatorReels.map(r => r.id);

    // Compute lifetime views across author's Reels
    const lifetimeViews = creatorReels.reduce((sum, r) => sum + (Number(r.views_count) || 0), 0);

    // Metadata counts for engagement, followers, follow events, and period view events
    const [
      likesRes,
      commentsRes,
      bookmarksRes,
      totalFollowersRes,
      newFollowersRes,
      followEventsRes,
      viewEventsRes
    ] = await Promise.all([
      reelIds.length > 0
        ? supabase.from('community_likes').select('*', { count: 'exact', head: true }).in('post_id', reelIds)
        : { count: 0 },
      reelIds.length > 0
        ? supabase.from('community_comments').select('*', { count: 'exact', head: true }).in('post_id', reelIds)
        : { count: 0 },
      reelIds.length > 0
        ? supabase.from('community_bookmarks').select('*', { count: 'exact', head: true }).in('post_id', reelIds)
        : { count: 0 },
      supabase.from('community_follows').select('*', { count: 'exact', head: true }).eq('following_id', creatorId),
      supabase.from('community_follows').select('*', { count: 'exact', head: true }).eq('following_id', creatorId).gte('created_at', startDateISO),
      supabase.from('community_follows').select('created_at').eq('following_id', creatorId).gte('created_at', startDateISO),
      reelIds.length > 0
        ? supabase.from('reel_view_events').select('reel_id, viewer_id, anon_session_id, session_bucket, watch_duration_seconds').in('reel_id', reelIds).gte('session_bucket', startDateStr)
        : { data: [], error: null }
    ]);

    if (viewEventsRes.error) throw viewEventsRes.error;

    const totalLikes = likesRes.count || 0;
    const totalComments = commentsRes.count || 0;
    const totalBookmarks = bookmarksRes.count || 0;
    const totalFollowers = totalFollowersRes.count || 0;
    const newFollowersPeriod = newFollowersRes.count || 0;
    const followEvents = followEventsRes.data || [];
    const viewEvents = viewEventsRes.data || [];

    // Calculate daily follower growth trend
    const followerDailyMap = {};
    followEvents.forEach(f => {
      const d = new Date(f.created_at || Date.now()).toISOString().split('T')[0];
      followerDailyMap[d] = (followerDailyMap[d] || 0) + 1;
    });

    const followerTrendList = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      followerTrendList.push({
        date: d,
        new_followers: followerDailyMap[d] || 0
      });
    }

    // Lifetime Engagement Rate calculation: ((Lifetime Likes + Comments + Saves) / Lifetime Views) * 100
    const engagementRatePct = lifetimeViews > 0
      ? Number((((totalLikes + totalComments + totalBookmarks) / lifetimeViews) * 100).toFixed(2))
      : 0;

    // Aggregate Period View Events & Daily Trend
    const authViewersSet = new Set();
    const anonViewersSet = new Set();
    const overallViewersSet = new Set();
    let totalWatchTimeSec = 0;
    const dailyBucketMap = {};

    viewEvents.forEach(evt => {
      if (evt.viewer_id) {
        authViewersSet.add(evt.viewer_id);
        overallViewersSet.add(evt.viewer_id);
      }
      if (evt.anon_session_id) {
        anonViewersSet.add(evt.anon_session_id);
        overallViewersSet.add(evt.anon_session_id);
      }
      const dur = Number(evt.watch_duration_seconds) || 0;
      totalWatchTimeSec += dur;

      const bucket = evt.session_bucket || new Date(evt.created_at || Date.now()).toISOString().split('T')[0];
      if (!dailyBucketMap[bucket]) {
        dailyBucketMap[bucket] = { date: bucket, views: 0, watch_time_seconds: 0 };
      }
      dailyBucketMap[bucket].views += 1;
      dailyBucketMap[bucket].watch_time_seconds += dur;
    });

    const totalPeriodViews = viewEvents.length;
    const avgWatchDuration = totalPeriodViews > 0 ? Number((totalWatchTimeSec / totalPeriodViews).toFixed(2)) : 0;

    // Build contiguous daily trend array filled with 0s for missing dates in UTC
    const trendList = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      if (dailyBucketMap[d]) {
        trendList.push({
          date: d,
          views: dailyBucketMap[d].views,
          watch_time_seconds: Number(dailyBucketMap[d].watch_time_seconds.toFixed(2))
        });
      } else {
        trendList.push({
          date: d,
          views: 0,
          watch_time_seconds: 0
        });
      }
    }

    // Top 10 Reels (Ordered by views_count DESC, created_at DESC)
    const topReels = creatorReels.slice(0, 10).map(r => {
      const rViews = Number(r.views_count) || 0;
      const rEvents = viewEvents.filter(ev => ev.reel_id === r.id);
      const rWatchSec = rEvents.reduce((acc, ev) => acc + (Number(ev.watch_duration_seconds) || 0), 0);
      const rAvgWatch = rEvents.length > 0 ? Number((rWatchSec / rEvents.length).toFixed(2)) : 0;

      return {
        id: r.id,
        content: r.content || '',
        media_url: Array.isArray(r.media_urls) ? r.media_urls[0] : (r.media_urls || null),
        video_duration: r.video_duration || 0,
        views_count: rViews,
        avg_watch_duration_seconds: rAvgWatch,
        created_at: r.created_at
      };
    });

    // Fetch pre-computed readiness or compute live using original 6-dimension formula
    let readinessData = await this._getRevenueReadiness(creatorId);
    if (!readinessData || !readinessData.overall_score) {
      const computedScores = await this.computeRevenueReadiness(creatorId);
      readinessData = computedScores;
    } else {
      const { data: fullReadiness } = await supabase
        .from('creator_revenue_readiness')
        .select('overall_score, active_learners_score, completion_rate_score, content_quality_score, ai_engagement_score, publishing_consistency_score, community_trust_score, is_monetization_eligible')
        .eq('creator_id', creatorId)
        .maybeSingle();
      if (fullReadiness) {
        readinessData = fullReadiness;
      }
    }

    const overallReadinessScore = readinessData.overall_score || 0;
    const creatorReadiness = {
      overall_score: overallReadinessScore,
      active_learners_score: readinessData.active_learners_score || 0,
      completion_rate_score: readinessData.completion_rate_score || 0,
      content_quality_score: readinessData.content_quality_score || 0,
      ai_engagement_score: readinessData.ai_engagement_score || 0,
      publishing_consistency_score: readinessData.publishing_consistency_score || 0,
      community_trust_score: readinessData.community_trust_score || 0,
      is_ready: overallReadinessScore >= 70 || readinessData.is_monetization_eligible || false
    };

    // Phase 13: Fetch latest pre-computed learning impact snapshot
    const { data: latestSnapshot } = await supabase
      .from('creator_analytics_snapshots')
      .select('quiz_completions, avg_quiz_score, learning_path_completions, retention_7d_pct, retention_30d_pct')
      .eq('creator_id', creatorId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    let learningImpact = {
      status: 'unavailable',
      metrics: null
    };

    if (latestSnapshot) {
      learningImpact = {
        status: 'available',
        metrics: {
          quiz_completions: latestSnapshot.quiz_completions ?? 0,
          avg_quiz_score: latestSnapshot.avg_quiz_score !== null && latestSnapshot.avg_quiz_score !== undefined ? Number(latestSnapshot.avg_quiz_score) : null,
          learning_path_completions: latestSnapshot.learning_path_completions ?? 0,
          retention_7d_pct: latestSnapshot.retention_7d_pct !== null && latestSnapshot.retention_7d_pct !== undefined ? Number(latestSnapshot.retention_7d_pct) : null,
          retention_30d_pct: latestSnapshot.retention_30d_pct !== null && latestSnapshot.retention_30d_pct !== undefined ? Number(latestSnapshot.retention_30d_pct) : null
        }
      };
    }

    return {
      success: true,
      mode_status: 'active',
      period: periodStr,
      creator_profile: {
        is_creator: profile.is_creator || false,
        creator_mode_enabled: profile.creator_mode_enabled || false,
        creator_category: profile.creator_category || null,
        creator_onboarded_at: profile.creator_onboarded_at || null,
        social_links: profile.social_links || {}
      },
      overview: {
        total_views: totalPeriodViews,
        lifetime_views: lifetimeViews,
        unique_viewers: overallViewersSet.size,
        total_followers: totalFollowers,
        followers_gained_period: newFollowersPeriod,
        total_likes: totalLikes,
        total_comments: totalComments,
        total_saves: totalBookmarks,
        engagement_rate_pct: engagementRatePct,
        total_published_reels: creatorReels.length
      },
      creator_readiness: creatorReadiness,
      audience_growth: {
        current_followers: totalFollowers,
        period: periodStr,
        new_followers_period: newFollowersPeriod,
        daily_growth_trend: followerTrendList
      },
      reels_summary: {
        total_watch_time_seconds: Number(totalWatchTimeSec.toFixed(2)),
        avg_watch_duration_seconds: avgWatchDuration,
        authenticated_viewers: authViewersSet.size,
        anonymous_viewers: anonViewersSet.size
      },
      trend: trendList,
      top_reels: topReels,
      top_insights: await this._getTopInsights(creatorId),
      monetization: {
        status: 'coming_soon'
      },
      learning_impact: learningImpact
    };
  }

  // ─── Get Dashboard Summary ────────────────────────────────
  // Returns the last 30-day trend + today's snapshot.
  // Reads from pre-computed snapshots — never live aggregates.
  async getDashboardSummary(creatorId) {
    const [snapshots, readiness, insights] = await Promise.all([
      this._getSnapshots(creatorId, 30),
      this._getRevenueReadiness(creatorId),
      this._getTopInsights(creatorId)
    ]);

    if (!snapshots.length) return this._emptyDashboard(creatorId);

    const latest = snapshots[0];
    const prev = snapshots[6] ?? snapshots[snapshots.length - 1]; // 7 days ago for trend

    return {
      // Reach
      total_views:        latest.total_views,
      unique_readers:     latest.unique_readers,
      followers_gained:   snapshots.reduce((s, r) => s + r.followers_gained, 0),
      reach_trend_pct:    this._trendPct(latest.total_views, prev.total_views),

      // Engagement
      read_completion_pct:     latest.read_completion_pct,
      avg_reading_time_seconds: latest.avg_reading_time_seconds,
      total_saves:             snapshots.reduce((s, r) => s + r.total_saves, 0),
      total_shares:            snapshots.reduce((s, r) => s + r.total_shares, 0),

      // Learning
      quiz_completions:          snapshots.reduce((s, r) => s + r.quiz_completions, 0),
      avg_quiz_score:            latest.avg_quiz_score,
      learning_path_completions: snapshots.reduce((s, r) => s + r.learning_path_completions, 0),
      retention_7d_pct:          latest.retention_7d_pct,
      retention_30d_pct:         latest.retention_30d_pct,

      // AI
      ai_tutor_sessions: snapshots.reduce((s, r) => s + r.ai_tutor_sessions, 0),
      top_ai_questions:  latest.top_ai_questions ?? [],

      // Revenue Readiness
      readiness,

      // Content Insights
      top_insights: insights,

      // Historical data for charts
      history: snapshots.reverse() // oldest → newest for chart rendering
    };
  }

  // ─── Revenue Readiness Score ──────────────────────────────
  async computeRevenueReadiness(creatorId) {
    const snapshots = await this._getSnapshots(creatorId, 30);
    if (!snapshots.length) return this._zeroReadiness(creatorId);

    const latest = snapshots[0];
    const sumOver30 = (key) => snapshots.reduce((s, r) => s + (r[key] ?? 0), 0);

    // Active learners score (0–100): >100 learners/month = 100
    const activeLearnersScore = Math.min(latest.unique_readers / 1, 100);

    // Completion rate score
    const completionScore = latest.read_completion_pct ?? 0;

    // Content quality: avg quiz score * 100 (already 0-100)
    const qualityScore = Math.min((latest.avg_quiz_score ?? 0) * 100, 100);

    // AI engagement: >50 AI sessions/month = 100
    const aiEngagementScore = Math.min(sumOver30('ai_tutor_sessions') * 2, 100);

    // Publishing consistency: published at least 4 of last 30 days = 100
    const activeDays = snapshots.filter(s => s.total_views > 0).length;
    const consistencyScore = Math.min((activeDays / 4) * 100, 100);

    // Community trust: based on saves + shares relative to views
    const totalInteractions = sumOver30('total_saves') + sumOver30('total_shares') + sumOver30('total_comments');
    const trustScore = latest.total_views > 0
      ? Math.min((totalInteractions / latest.total_views) * 100, 100)
      : 0;

    const scores = {
      active_learners_score:       Math.round(activeLearnersScore),
      completion_rate_score:       Math.round(completionScore),
      content_quality_score:       Math.round(qualityScore),
      ai_engagement_score:         Math.round(aiEngagementScore),
      publishing_consistency_score: Math.round(consistencyScore),
      community_trust_score:        Math.round(trustScore)
    };

    // Upsert into DB
    await supabase.from('creator_revenue_readiness').upsert({
      creator_id: creatorId,
      ...scores,
      calculated_at: new Date().toISOString()
    }, { onConflict: 'creator_id' });

    const overallScore = Math.round(
      (scores.active_learners_score +
       scores.completion_rate_score +
       scores.content_quality_score +
       scores.ai_engagement_score +
       scores.publishing_consistency_score +
       scores.community_trust_score) / 6
    );

    return {
      ...scores,
      overall_score: overallScore,
      is_monetization_eligible: overallScore >= 70
    };
  }

  // ─── AI Creator Recommendations ───────────────────────────
  // Uses the Knowledge Graph to surface actionable creator suggestions.
  async getAiRecommendations(creatorId, spaceId) {
    const suggestions = [];

    // 1. Check for outdated artifacts
    const { data: outdated } = await supabase
      .from('flashcards')
      .select('id, source_node_id, source_node_type')
      .eq('is_outdated', true)
      .limit(5);

    if (outdated?.length) {
      suggestions.push({
        type: 'outdated_content',
        priority: 'high',
        message: `${outdated.length} flashcard set(s) are outdated because their source content changed.`,
        action: 'Regenerate flashcards',
        affected_count: outdated.length
      });
    }

    // 2. Check for content without quizzes (using graph edges)
    const { data: wikiWithoutQuizzes } = await supabase
      .from('space_wiki_pages')
      .select('id, title')
      .eq('space_id', spaceId)
      .limit(20);

    if (wikiWithoutQuizzes?.length) {
      const wikiWithQuizzes = await Promise.all(
        wikiWithoutQuizzes.map(async w => {
          const edges = await graphService.getAdjacentEdges({ nodeId: w.id, nodeType: 'wiki', minConfidence: 1.0 });
          return { ...w, hasQuiz: edges.some(e => e.target_type === 'quiz' || e.source_type === 'quiz') };
        })
      );
      const missing = wikiWithQuizzes.filter(w => !w.hasQuiz);
      if (missing.length) {
        suggestions.push({
          type: 'missing_quiz',
          priority: 'medium',
          message: `${missing.length} wiki page(s) have no quiz. Adding quizzes improves learner retention significantly.`,
          action: 'Generate quizzes',
          affected_nodes: missing.slice(0, 3).map(w => ({ id: w.id, title: w.title }))
        });
      }
    }

    // 3. Check content insights for high drop-off pages
    const { data: highDropOff } = await supabase
      .from('content_insights')
      .select('node_id, node_type, drop_off_pct, peak_drop_off_position')
      .eq('creator_id', creatorId)
      .gt('drop_off_pct', 60)
      .order('drop_off_pct', { ascending: false })
      .limit(3);

    if (highDropOff?.length) {
      suggestions.push({
        type: 'high_dropoff',
        priority: 'high',
        message: `${highDropOff.length} content item(s) have >60% reader drop-off. Consider adding summaries or breaking them into shorter sections.`,
        action: 'Review & restructure',
        affected_nodes: highDropOff
      });
    }

    // 4. Check for concepts users struggle with
    const { data: struggleInsights } = await supabase
      .from('content_insights')
      .select('concepts_users_struggle_with')
      .eq('creator_id', creatorId)
      .not('concepts_users_struggle_with', 'eq', '{}')
      .limit(5);

    const allConcepts = (struggleInsights ?? []).flatMap(i => i.concepts_users_struggle_with ?? []);
    if (allConcepts.length) {
      const uniqueConcepts = [...new Set(allConcepts)].slice(0, 5);
      suggestions.push({
        type: 'weak_concepts',
        priority: 'medium',
        message: `Learners frequently struggle with: ${uniqueConcepts.join(', ')}. Consider creating targeted explanations or flashcards.`,
        action: 'Create targeted content',
        concepts: uniqueConcepts
      });
    }

    return suggestions.sort((a, b) =>
      (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1)
    );
  }

  // ─── Creator Reels Analytics (MVP) ─────────────────────────────────
  async getReelsPortfolioAnalytics(creatorId, period = '30d') {
    // 1. Scope Reels strictly to creator ID
    const { data: reels, error: reelsErr } = await supabase
      .from('community_posts')
      .select('id, content, post_type, is_reel, media_urls, video_duration, views_count, created_at')
      .eq('author_id', creatorId)
      .or('is_reel.eq.true,post_type.eq.reel,post_type.eq.video')
      .order('views_count', { ascending: false });

    if (reelsErr) throw reelsErr;

    const creatorReels = reels || [];
    if (creatorReels.length === 0) {
      return {
        summary: {
          total_reels: 0,
          total_views: 0,
          unique_viewers: 0,
          authenticated_viewers: 0,
          anonymous_viewers: 0,
          total_watch_time_seconds: 0,
          avg_watch_duration_seconds: 0,
          total_likes: 0,
          total_comments: 0,
          total_bookmarks: 0,
          engagement_rate_pct: 0
        },
        trend: [],
        top_reels: []
      };
    }

    const reelIds = creatorReels.map(r => r.id);

    // Calculate date filter
    let startDateStr = null;
    if (period === '7d') {
      startDateStr = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    } else if (period === '30d') {
      startDateStr = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    } else if (period === '90d') {
      startDateStr = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    }

    // 2. Fetch view events for creator's Reels within date filter
    let viewQuery = supabase
      .from('reel_view_events')
      .select('reel_id, viewer_id, anon_session_id, session_bucket, watch_duration_seconds')
      .in('reel_id', reelIds);

    if (startDateStr) {
      viewQuery = viewQuery.gte('session_bucket', startDateStr);
    }

    // 3. Fetch engagement counts independently (prevents SQL join multiplication)
    const [
      { data: viewEventsData, error: viewErr },
      { count: likesCount },
      { count: commentsCount },
      { count: bookmarksCount }
    ] = await Promise.all([
      viewQuery,
      supabase.from('community_likes').select('*', { count: 'exact', head: true }).in('post_id', reelIds),
      supabase.from('community_comments').select('*', { count: 'exact', head: true }).in('post_id', reelIds),
      supabase.from('community_bookmarks').select('*', { count: 'exact', head: true }).in('post_id', reelIds)
    ]);

    if (viewErr) throw viewErr;
    const viewEvents = viewEventsData || [];

    // Aggregations
    const authViewersSet = new Set();
    const anonViewersSet = new Set();
    const overallViewersSet = new Set();
    let totalWatchTimeSec = 0;

    const dailyBucketMap = {};

    viewEvents.forEach(evt => {
      if (evt.viewer_id) {
        authViewersSet.add(evt.viewer_id);
        overallViewersSet.add(evt.viewer_id);
      }
      if (evt.anon_session_id) {
        anonViewersSet.add(evt.anon_session_id);
        overallViewersSet.add(evt.anon_session_id);
      }
      const dur = Number(evt.watch_duration_seconds) || 0;
      totalWatchTimeSec += dur;

      // Group trend by bucket date
      const bucket = evt.session_bucket || new Date(evt.created_at || Date.now()).toISOString().split('T')[0];
      if (!dailyBucketMap[bucket]) {
        dailyBucketMap[bucket] = { date: bucket, views: 0, watch_time_seconds: 0 };
      }
      dailyBucketMap[bucket].views += 1;
      dailyBucketMap[bucket].watch_time_seconds += dur;
    });

    const totalQualifiedViews = viewEvents.length > 0 ? viewEvents.length : creatorReels.reduce((s, r) => s + (r.views_count || 0), 0);
    const avgWatchDuration = totalQualifiedViews > 0 ? Number((totalWatchTimeSec / totalQualifiedViews).toFixed(2)) : 0;

    const totalLikes = likesCount || 0;
    const totalComments = commentsCount || 0;
    const totalBookmarks = bookmarksCount || 0;
    const engagementRatePct = totalQualifiedViews > 0
      ? Number((((totalLikes + totalComments + totalBookmarks) / totalQualifiedViews) * 100).toFixed(2))
      : 0;

    // Build trend in chronological ascending order
    const trend = Object.values(dailyBucketMap).sort((a, b) => a.date.localeCompare(b.date));

    // Format top Reels
    const topReels = creatorReels.slice(0, 10).map(r => {
      const rViews = r.views_count || 0;
      const rWatchEvents = viewEvents.filter(ev => ev.reel_id === r.id);
      const rWatchSec = rWatchEvents.reduce((acc, ev) => acc + (Number(ev.watch_duration_seconds) || 0), 0);
      const rAvgWatch = rWatchEvents.length > 0 ? Number((rWatchSec / rWatchEvents.length).toFixed(2)) : 0;

      return {
        id: r.id,
        content: r.content || '',
        media_url: Array.isArray(r.media_urls) ? r.media_urls[0] : (r.media_urls || null),
        video_duration: r.video_duration || 0,
        views_count: rViews,
        avg_watch_duration_seconds: rAvgWatch,
        created_at: r.created_at
      };
    });

    return {
      summary: {
        total_reels: creatorReels.length,
        total_views: totalQualifiedViews,
        unique_viewers: overallViewersSet.size,
        authenticated_viewers: authViewersSet.size,
        anonymous_viewers: anonViewersSet.size,
        total_watch_time_seconds: Number(totalWatchTimeSec.toFixed(2)),
        avg_watch_duration_seconds: avgWatchDuration,
        total_likes: totalLikes,
        total_comments: totalComments,
        total_bookmarks: totalBookmarks,
        engagement_rate_pct: engagementRatePct
      },
      trend,
      top_reels: topReels
    };
  }

  async getSingleReelAnalytics(creatorId, reelId) {
    // 1. Verify ownership & post existence
    const { data: reel, error: reelErr } = await supabase
      .from('community_posts')
      .select('id, author_id, content, post_type, is_reel, media_urls, video_duration, views_count, created_at')
      .eq('id', reelId)
      .maybeSingle();

    if (reelErr || !reel) {
      const err = new Error('Reel not found');
      err.status = 404;
      throw err;
    }

    if (reel.author_id !== creatorId) {
      const err = new Error('Access denied: You are not the author of this Reel');
      err.status = 403;
      throw err;
    }

    // 2. Fetch view events & engagement
    const [
      { data: viewEventsData, error: viewErr },
      { count: likesCount },
      { count: commentsCount },
      { count: bookmarksCount }
    ] = await Promise.all([
      supabase.from('reel_view_events').select('viewer_id, anon_session_id, watch_duration_seconds, is_muted').eq('reel_id', reelId),
      supabase.from('community_likes').select('*', { count: 'exact', head: true }).eq('post_id', reelId),
      supabase.from('community_comments').select('*', { count: 'exact', head: true }).eq('post_id', reelId),
      supabase.from('community_bookmarks').select('*', { count: 'exact', head: true }).eq('post_id', reelId)
    ]);

    if (viewErr) throw viewErr;

    const viewEvents = viewEventsData || [];
    const authViewersSet = new Set();
    const anonViewersSet = new Set();
    const overallViewersSet = new Set();
    let totalWatchSec = 0;

    viewEvents.forEach(evt => {
      if (evt.viewer_id) {
        authViewersSet.add(evt.viewer_id);
        overallViewersSet.add(evt.viewer_id);
      }
      if (evt.anon_session_id) {
        anonViewersSet.add(evt.anon_session_id);
        overallViewersSet.add(evt.anon_session_id);
      }
      totalWatchSec += Number(evt.watch_duration_seconds) || 0;
    });

    const viewsCount = reel.views_count || viewEvents.length;
    const avgWatchSec = viewEvents.length > 0 ? Number((totalWatchSec / viewEvents.length).toFixed(2)) : 0;
    const likes = likesCount || 0;
    const comments = commentsCount || 0;
    const bookmarks = bookmarksCount || 0;
    const engagementRatePct = viewsCount > 0
      ? Number((((likes + comments + bookmarks) / viewsCount) * 100).toFixed(2))
      : 0;

    return {
      reel: {
        id: reel.id,
        content: reel.content || '',
        media_url: Array.isArray(reel.media_urls) ? reel.media_urls[0] : (reel.media_urls || null),
        video_duration: reel.video_duration || 0,
        published_at: reel.created_at,
        views_count: viewsCount,
        unique_viewers: overallViewersSet.size,
        authenticated_viewers: authViewersSet.size,
        anonymous_viewers: anonViewersSet.size,
        total_watch_time_seconds: Number(totalWatchSec.toFixed(2)),
        avg_watch_duration_seconds: avgWatchSec,
        likes_count: likes,
        comments_count: comments,
        bookmarks_count: bookmarks,
        engagement_rate_pct: engagementRatePct
      }
    };
  }

  // ─── Internal helpers ─────────────────────────────────────
  async _getSnapshots(creatorId, days) {
    const { data } = await supabase
      .from('creator_analytics_snapshots')
      .select('*')
      .eq('creator_id', creatorId)
      .gte('snapshot_date', new Date(Date.now() - days * 86400000).toISOString().split('T')[0])
      .order('snapshot_date', { ascending: false });
    return data ?? [];
  }

  async _getRevenueReadiness(creatorId) {
    const { data } = await supabase
      .from('creator_revenue_readiness')
      .select('overall_score, is_monetization_eligible')
      .eq('creator_id', creatorId)
      .maybeSingle();
    return data ?? { overall_score: 0, is_monetization_eligible: false };
  }

  async _getTopInsights(creatorId) {
    const { data } = await supabase
      .from('content_insights')
      .select('node_id, node_type, avg_completion_pct, drop_off_pct, avg_quiz_accuracy, ai_question_count')
      .eq('creator_id', creatorId)
      .order('ai_question_count', { ascending: false })
      .limit(5);
    return data ?? [];
  }

  _trendPct(current, previous) {
    if (!previous || previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  _emptyDashboard(creatorId) {
    return {
      total_views: 0, unique_readers: 0, followers_gained: 0, reach_trend_pct: 0,
      read_completion_pct: 0, avg_reading_time_seconds: 0, total_saves: 0, total_shares: 0,
      quiz_completions: 0, avg_quiz_score: 0, learning_path_completions: 0,
      retention_7d_pct: 0, retention_30d_pct: 0, ai_tutor_sessions: 0,
      top_ai_questions: [], readiness: { overall_score: 0, is_monetization_eligible: false },
      top_insights: [], history: []
    };
  }

  _zeroReadiness(creatorId) {
    return {
      active_learners_score: 0, completion_rate_score: 0, content_quality_score: 0,
      ai_engagement_score: 0, publishing_consistency_score: 0, community_trust_score: 0
    };
  }
}

module.exports = new CreatorAnalyticsService();
