const supabase = require('../../config/database');
const memoryEngine = require('./MemoryEngine');
const graphService = require('../graph/GraphService');

class PracticeModeService {

  /**
   * Build a mixed-review session for a user.
   * Combines: due flashcards, weak-topic cards, and unseen cards from specified spaces/paths.
   */
  async buildSession({ userId, spaceIds = [], pathIds = [], sessionType = 'mixed', targetCount = 20 }) {
    const cards = [];
    const seenIds = new Set();

    const addCards = (batch) => {
      for (const c of (batch ?? [])) {
        if (!seenIds.has(c.node_id ?? c.id)) {
          seenIds.add(c.node_id ?? c.id);
          cards.push(c);
        }
      }
    };

    // ── Tier 1: Overdue cards (highest priority) ──────────────
    if (sessionType === 'mixed' || sessionType === 'due_only') {
      const due = await memoryEngine.getDueCards(userId, 10);
      // Sort by most overdue first
      const sorted = (due ?? []).sort((a, b) =>
        new Date(a.next_review_at).getTime() - new Date(b.next_review_at).getTime()
      );
      addCards(sorted.map(d => ({ ...d, source: 'due' })));
    }

    // ── Tier 2: Weak-topic flashcards ─────────────────────────
    if (sessionType === 'mixed' || sessionType === 'weak_focus') {
      const { data: weakSessions } = await supabase
        .from('learning_sessions')
        .select('node_id, node_type, quality, success_streak')
        .eq('user_id', userId)
        .eq('node_type', 'flashcard')
        .lt('quality', 3)
        .lt('success_streak', 3)
        .order('quality', { ascending: true })
        .limit(8);

      if (weakSessions?.length) {
        const weakIds = weakSessions.map(s => s.node_id);
        const { data: weakCards } = await supabase
          .from('flashcards')
          .select('*')
          .in('id', weakIds);
        addCards((weakCards ?? []).map(c => ({ ...c, source: 'weak' })));
      }
    }

    // ── Tier 3: Unseen cards from specified spaces/paths ──────
    if ((sessionType === 'mixed' || sessionType === 'new_only') && spaceIds.length > 0) {
      const { data: allSpaceCards } = await supabase
        .from('flashcards')
        .select('*')
        .in('space_id', spaceIds)
        .eq('is_outdated', false)
        .order('calibrated_difficulty', { ascending: true }) // Start easier for new cards
        .limit(targetCount);

      // Only include cards the user hasn't reviewed yet
      const reviewedIds = new Set(cards.map(c => c.id));
      const { data: reviewed } = await supabase
        .from('learning_sessions')
        .select('node_id')
        .eq('user_id', userId)
        .eq('node_type', 'flashcard');
      const reviewedNodeIds = new Set((reviewed ?? []).map(r => r.node_id));

      const unseen = (allSpaceCards ?? []).filter(
        c => !reviewedNodeIds.has(c.id) && !reviewedIds.has(c.id)
      );
      addCards(unseen.map(c => ({ ...c, source: 'new' })));
    }

    // ── Trim to target count and shuffle ─────────────────────
    const session = cards.slice(0, targetCount);
    const shuffled = this._shuffle(session);

    // Persist session record
    const { data: sessionRecord } = await supabase
      .from('practice_sessions')
      .insert({
        user_id: userId,
        space_ids: spaceIds,
        path_ids: pathIds,
        session_type: sessionType,
        total_cards: shuffled.length
      })
      .select()
      .single();

    return {
      session_id: sessionRecord?.id,
      cards: shuffled,
      breakdown: {
        due: shuffled.filter(c => c.source === 'due').length,
        weak: shuffled.filter(c => c.source === 'weak').length,
        new: shuffled.filter(c => c.source === 'new').length
      }
    };
  }

  /**
   * Update session completion stats.
   */
  async completeSession(sessionId, { completedCards, accuracyPct }) {
    await supabase
      .from('practice_sessions')
      .update({ completed_cards: completedCards, accuracy_pct: accuracyPct, completed_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

module.exports = new PracticeModeService();
