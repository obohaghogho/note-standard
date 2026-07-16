const supabase = require('../../config/database');
const graphService = require('../graph/GraphService');

class AdaptiveLearner {

  /**
   * Determine the best next node for a user to study.
   * Factors: completed nodes, weak topics, time since last review, user goal, available time.
   */
  async suggestNextLesson({ userId, pathId, spaceId, availableMinutes = 15 }) {
    // 1. Fetch what the user has already completed or started
    const { data: progress } = await supabase
      .from('user_knowledge_progress')
      .select('node_id, status')
      .eq('user_id', userId)
      .eq('path_id', pathId);

    const completedIds = new Set((progress || []).filter(p => p.status === 'completed').map(p => p.node_id));
    const inProgressIds = (progress || []).filter(p => p.status === 'in_progress').map(p => p.node_id);

    // 2. Prefer to continue in-progress nodes first
    if (inProgressIds.length > 0) {
      return { type: 'continue', node_id: inProgressIds[0], reason: 'Continue where you left off' };
    }

    // 3. Fetch all path nodes in order
    const { data: allNodes } = await supabase
      .from('learning_path_nodes')
      .select('id, node_id, node_type, order_index, title')
      .eq('path_id', pathId)
      .order('order_index', { ascending: true });

    if (!allNodes) return null;

    // 4. Find first uncompleted node
    const nextNode = allNodes.find(n => !completedIds.has(n.id));
    if (!nextNode) return { type: 'completed', reason: 'You have completed all nodes in this path!' };

    // 5. Check weak topics from learning sessions
    const weakTopics = await this._getWeakTopics(userId);

    // 6. Check if the next node relates to a weak topic (prioritize it)
    const relatedEdges = await graphService.getAdjacentEdges({
      nodeId: nextNode.node_id,
      nodeType: nextNode.node_type,
      minConfidence: 0.5
    });

    const isRelatedToWeakTopic = relatedEdges?.some(e =>
      weakTopics.some(w => w.node_id === e.target_id || w.node_id === e.source_id)
    );

    // 7. Estimate time and check against budget
    const estimatedMinutes = nextNode.node_type === 'quiz' ? 10 : nextNode.node_type === 'wiki' ? 8 : 5;
    const fitsInBudget = estimatedMinutes <= availableMinutes;

    return {
      type: 'next',
      node: nextNode,
      reason: isRelatedToWeakTopic
        ? `This addresses a topic you found difficult recently`
        : `Next in your learning path`,
      estimated_minutes: estimatedMinutes,
      fits_budget: fitsInBudget,
      related_edges: relatedEdges?.slice(0, 3) ?? []
    };
  }

  /**
   * Identify topics the user consistently struggles with.
   */
  async _getWeakTopics(userId) {
    const { data } = await supabase
      .from('learning_sessions')
      .select('node_id, node_type, quality, success_streak')
      .eq('user_id', userId)
      .lt('quality', 3)       // Failed or barely passed
      .lt('success_streak', 2) // Hasn't recovered
      .order('quality', { ascending: true })
      .limit(10);

    return data ?? [];
  }

  /**
   * Build a personalized study schedule for a user.
   * Returns an ordered list of recommended nodes for the week.
   */
  async buildWeeklySchedule({ userId, spaceId, availableMinutesPerDay = 15 }) {
    const schedule = [];
    const daysOfWeek = 7;

    // Get user goals
    const { data: goal } = await supabase
      .from('user_learning_goals')
      .select('*')
      .eq('user_id', userId)
      .eq('space_id', spaceId)
      .eq('is_active', true)
      .maybeSingle();

    // Get all active learning paths for this space
    const { data: paths } = await supabase
      .from('learning_paths')
      .select('id, title, level')
      .eq('space_id', spaceId)
      .eq('is_published', true);

    if (!paths?.length) return schedule;

    // Distribute nodes across the week
    for (let day = 0; day < daysOfWeek; day++) {
      const dayDate = new Date();
      dayDate.setDate(dayDate.getDate() + day);

      const daySchedule = {
        date: dayDate.toISOString().split('T')[0],
        items: [],
        total_minutes: 0
      };

      // For each path, suggest a next node
      for (const path of paths.slice(0, 2)) { // Max 2 paths per day
        if (daySchedule.total_minutes >= availableMinutesPerDay) break;

        const suggestion = await this.suggestNextLesson({
          userId, pathId: path.id, spaceId, availableMinutes: availableMinutesPerDay - daySchedule.total_minutes
        });

        if (suggestion?.type !== 'completed' && suggestion?.fits_budget !== false) {
          daySchedule.items.push({ path_title: path.title, ...suggestion });
          daySchedule.total_minutes += suggestion.estimated_minutes ?? 5;
        }
      }

      schedule.push(daySchedule);
    }

    return schedule;
  }
}

module.exports = new AdaptiveLearner();
