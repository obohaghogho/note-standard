const supabase = require('../../config/database');

// SM-2 Spaced Repetition Algorithm
// Based on the SuperMemo SM-2 algorithm.
// quality: 0 = complete blackout, 5 = perfect response
function sm2(easeFactor, interval, streak, quality) {
  let newEase = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEase = Math.max(1.3, newEase); // Ease factor floor

  let newInterval;
  let newStreak;

  if (quality < 3) {
    // Failed — reset interval
    newInterval = 1;
    newStreak = 0;
  } else {
    newStreak = streak + 1;
    if (newStreak === 1) newInterval = 1;
    else if (newStreak === 2) newInterval = 6;
    else newInterval = Math.round(interval * newEase);
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  return { newEase, newInterval, newStreak, nextReview };
}

class MemoryEngine {

  /**
   * Record a review result and update SM-2 state.
   * quality: 0–5 (0 = blackout, 5 = perfect)
   */
  async recordReview({ userId, nodeId, nodeType, quality, timeSpentSeconds }) {
    // Fetch existing session if it exists
    const { data: existing } = await supabase
      .from('learning_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('node_id', nodeId)
      .eq('node_type', nodeType)
      .maybeSingle();

    const currentEase = existing?.ease_factor ?? 2.5;
    const currentInterval = existing?.interval_days ?? 1;
    const currentStreak = existing?.success_streak ?? 0;
    const reviewCount = (existing?.review_count ?? 0) + 1;

    const { newEase, newInterval, newStreak, nextReview } = sm2(
      currentEase, currentInterval, currentStreak, quality
    );

    const sessionData = {
      user_id: userId,
      node_id: nodeId,
      node_type: nodeType,
      ease_factor: newEase,
      interval_days: newInterval,
      next_review_at: nextReview.toISOString(),
      success_streak: newStreak,
      quality,
      time_spent_seconds: timeSpentSeconds,
      review_count: reviewCount,
      completed_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('learning_sessions')
      .upsert(sessionData, { onConflict: 'user_id,node_id,node_type' });

    if (error) throw error;

    // Update streak
    await this._updateStreak(userId, timeSpentSeconds);

    return { ease_factor: newEase, interval_days: newInterval, next_review: nextReview };
  }

  /**
   * Get all cards due for review today.
   */
  async getDueCards(userId, limit = 20) {
    const { data, error } = await supabase
      .from('learning_sessions')
      .select('node_id, node_type, ease_factor, success_streak, review_count, next_review_at')
      .eq('user_id', userId)
      .lte('next_review_at', new Date().toISOString())
      .order('next_review_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  /**
   * Get today's study dashboard stats for a user.
   */
  async getDashboardStats(userId) {
    const [dueResult, streakResult, totalResult] = await Promise.all([
      supabase.from('learning_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lte('next_review_at', new Date().toISOString()),

      supabase.from('user_study_streaks')
        .select('current_streak_days, longest_streak_days, total_cards_reviewed, total_study_minutes')
        .eq('user_id', userId)
        .maybeSingle(),

      supabase.from('learning_sessions')
        .select('quality')
        .eq('user_id', userId)
        .gte('completed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ]);

    const dueCount = dueResult.count ?? 0;
    const streak = streakResult.data ?? { current_streak_days: 0, total_cards_reviewed: 0 };
    const recentSessions = totalResult.data ?? [];
    const avgQuality = recentSessions.length
      ? recentSessions.reduce((s, r) => s + (r.quality ?? 3), 0) / recentSessions.length
      : 0;
    const retentionPct = Math.round((avgQuality / 5) * 100);
    const estimatedMinutes = Math.ceil(dueCount * 0.65); // ~39s per card average

    return {
      cards_due: dueCount,
      retention_pct: retentionPct,
      current_streak: streak.current_streak_days,
      total_reviewed: streak.total_cards_reviewed,
      estimated_minutes: estimatedMinutes
    };
  }

  async _updateStreak(userId, timeSpentSeconds) {
    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('user_study_streaks')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      await supabase.from('user_study_streaks').insert({
        user_id: userId,
        current_streak_days: 1,
        longest_streak_days: 1,
        last_study_date: today,
        total_cards_reviewed: 1,
        total_study_minutes: Math.ceil((timeSpentSeconds ?? 0) / 60)
      });
      return;
    }

    const lastDate = existing.last_study_date;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const isConsecutive = lastDate === yesterday;
    const alreadyStudiedToday = lastDate === today;

    const newStreak = alreadyStudiedToday
      ? existing.current_streak_days
      : isConsecutive
        ? existing.current_streak_days + 1
        : 1;

    await supabase.from('user_study_streaks').update({
      current_streak_days: newStreak,
      longest_streak_days: Math.max(newStreak, existing.longest_streak_days),
      last_study_date: today,
      total_cards_reviewed: existing.total_cards_reviewed + 1,
      total_study_minutes: existing.total_study_minutes + Math.ceil((timeSpentSeconds ?? 0) / 60),
      updated_at: new Date().toISOString()
    }).eq('user_id', userId);
  }
}

module.exports = new MemoryEngine();
