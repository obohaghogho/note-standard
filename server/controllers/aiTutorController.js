const supabase = require('../config/database');
const Groq = require('groq-sdk');
const graphService = require('../services/graph/GraphService');
const memoryEngine = require('../services/learning/MemoryEngine');
const learningEngine = require('../services/learning/LearningEngine');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const TUTOR_MODES = {
  teach:          'Provide a thorough, well-structured explanation of the topic. Use examples and analogies.',
  explain_simple: 'Explain this concept as if the user is a complete beginner. Use very simple language, short sentences, and a relatable analogy.',
  socratic:       'Do NOT explain. Instead, ask the user a series of thought-provoking questions to guide them to discover the answer themselves. Start with one question.',
  diagnose:       'The user made mistakes. Identify the likely misconception behind their error and explain why their thinking was incorrect and what the right mental model is.',
  recommend:      'Based on the user\'s learning history and this Space\'s knowledge graph, recommend specific topics, wiki pages, or resources they should study next.',
  schedule:       'Create a personalized study plan. Ask about available time per day, goals, and deadlines if not already known. Then output a structured weekly schedule.',
  challenge:      'Present the user with increasingly difficult questions on this topic. Start with a medium difficulty question, then escalate based on their answer.',
  creator_assist: 'You are a Creator Assistant. Analyze the creator\'s content and provide actionable advice. Help improve titles, suggest tags, write summaries, detect duplicate content, or identify knowledge gaps based on the Knowledge Graph context provided. Be concise and professional.',
  marketplace_advisor: 'You are a Marketplace Advisor. Analyze the creator\'s revenue readiness score and product health. Suggest pricing ranges, identify missing premium material, recommend bundles, and explain exactly why they are or are not ready to monetize based on their metrics. Be strategic and commercially focused.'
};

exports.tutorChat = async (req, res, next) => {
  try {
    const { spaceId } = req.params;
    const { query, mode = 'teach', nodeId, nodeType, conversationHistory = [] } = req.body;
    const userId = req.user.id;

    if (!query) return res.status(400).json({ error: 'Query is required' });
    if (!TUTOR_MODES[mode]) return res.status(400).json({ error: `Invalid mode. Valid: ${Object.keys(TUTOR_MODES).join(', ')}` });

    // 1. Fetch Space context
    const { data: space } = await supabase
      .from('community_spaces')
      .select('name, description, manifest')
      .eq('id', spaceId)
      .single();

    if (!space) return res.status(404).json({ error: 'Space not found' });

    // 2. Build rich AI context from Knowledge Graph
    const [graphContext, dashboardStats, weakTopics, contextSufficiency] = await Promise.all([
      graphService.buildAiContext({ spaceId, query }),
      memoryEngine.getDashboardStats(userId),
      _getWeakTopicSummaries(userId),
      learningEngine.assessContextSufficiency(spaceId)
    ]);

    // 3. If a specific node is provided, fetch its content for deeper context
    let nodeContext = '';
    if (nodeId && nodeType) {
      const relatedNodes = await graphService.getAdjacentEdges({ nodeId, nodeType, minConfidence: 0.5, limit: 5 });
      nodeContext = `\nCurrently studying: ${nodeType} (${nodeId})\nRelated knowledge nodes: ${relatedNodes.length} connected items.`;
    }

    // 4. Build system prompt
    const modeInstruction = TUTOR_MODES[mode];
    const lowContextWarning = contextSufficiency.isLowContext
      ? `\n\nIMPORTANT CONTEXT NOTE: This Space currently has limited knowledge (${contextSufficiency.postCount} posts, ${contextSufficiency.edgeCount} graph connections). If you cannot find a confident answer from the available context, clearly state: "I found limited information in this Space. My answer is based on general knowledge and may not reflect this community's specific content." Do NOT speculate as if you have full context.`
      : '';

    const systemPrompt = mode === 'creator_assist' 
      ? `You are an intelligent AI Creator Assistant for "${space.name}" on NoteStandard.

MODE INSTRUCTION: ${modeInstruction}${lowContextWarning}

CREATOR STATS (30-day):
- Unique Readers: ${dashboardStats.unique_readers || 0}
- Avg Read Completion: ${dashboardStats.read_completion_pct || 0}%
- Avg Quiz Score: ${dashboardStats.avg_quiz_score || 0}%
- Top AI Questions by learners: ${JSON.stringify(dashboardStats.top_ai_questions || [])}

SPACE KNOWLEDGE GRAPH:
- ${graphContext.totalEdges} knowledge connections in this space${nodeContext}

BEHAVIORAL RULES:
- Provide actionable, specific advice for improving content.
- Base suggestions on the provided metrics and graph structure when possible.`
      : mode === 'marketplace_advisor'
      ? `You are a Marketplace Advisor for NoteStandard Creators.

MODE INSTRUCTION: ${modeInstruction}${lowContextWarning}

COMMERCE STATS:
- Readiness Score: ${dashboardStats.readiness?.overall_score || 0}/100 (Needs 70 to monetize)
- Unique Readers: ${dashboardStats.unique_readers || 0}
- Avg Read Completion: ${dashboardStats.read_completion_pct || 0}%
- Retention (30-day): ${dashboardStats.retention_30d_pct || 0}%

SPACE KNOWLEDGE GRAPH:
- ${graphContext.totalEdges} knowledge connections in this space${nodeContext}

BEHAVIORAL RULES:
- Frame advice around building a sustainable Knowledge Commerce ecosystem, not just quick sales.
- Base pricing and bundle recommendations on completion and retention metrics.`
      : `You are an intelligent AI Tutor for "${space.name}" on NoteStandard.

TUTOR MODE: ${mode.toUpperCase()}
MODE INSTRUCTION: ${modeInstruction}${lowContextWarning}

LEARNER CONTEXT:
- Cards due for review: ${dashboardStats.cards_due}
- Current retention rate: ${dashboardStats.retention_pct}%
- Study streak: ${dashboardStats.current_streak} days
- Weak topics: ${weakTopics.join(', ') || 'None identified yet'}

SPACE KNOWLEDGE GRAPH:
- ${graphContext.totalEdges} knowledge connections in this space${nodeContext}

BEHAVIORAL RULES:
- Be encouraging and patient
- Tailor complexity to the learner's level
- If in Socratic mode, NEVER give the answer directly
- If in Challenge mode, escalate difficulty progressively
- Always reference the Space's knowledge when relevant`;

    // 5. Build conversation messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-8), // Keep last 4 exchanges for context
      { role: 'user', content: query }
    ];

    const completion = await groq.chat.completions.create({
      messages,
      model: 'llama-3.1-8b-instant',
      temperature: mode === 'challenge' ? 0.5 : 0.3,
      max_tokens: 600
    });

    const answer = completion.choices[0]?.message?.content ?? 'I could not process that request.';

    res.json({
      answer,
      mode,
      context: {
        cards_due: dashboardStats.cards_due,
        retention_pct: dashboardStats.retention_pct,
        streak: dashboardStats.current_streak
      }
    });

  } catch (err) {
    next(err);
  }
};

async function _getWeakTopicSummaries(userId) {
  const { data } = await supabase
    .from('learning_sessions')
    .select('node_id, node_type, quality')
    .eq('user_id', userId)
    .lt('quality', 3)
    .limit(5);

  return (data ?? []).map(d => `${d.node_type}:${d.node_id}`);
}
