const supabase = require('../../config/database');
const graphService = require('../graph/GraphService');

class CreatorAnalyticsService {

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

    return scores;
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
