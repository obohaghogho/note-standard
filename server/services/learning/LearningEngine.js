const supabase = require('../../config/database');
const graphService = require('../graph/GraphService');
const Groq = require('groq-sdk');

const groq = (process.env.GROQ_API_KEY) ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const MODEL = 'llama-3.1-8b-instant';

// Builds the standard AI metadata payload attached to every artifact
function buildAiMetadata(sourceNodeIds, confidence = null) {
  return {
    model: MODEL,
    generated_at: new Date().toISOString(),
    confidence,          // null until calibrated; 0–1 scale
    human_reviewed: false,
    source_node_ids: sourceNodeIds,
    generation_version: 1
  };
}

class LearningEngine {

  // ─── Flashcard Generation ────────────────────────────────
  async generateFlashcards(nodeId, nodeType, spaceId, count = 5) {
    if (!groq) throw new Error("AI service is currently unavailable. Groq API key is not configured.");
    const content = await this._fetchNodeContent(nodeId, nodeType);
    if (!content) throw new Error(`Cannot fetch content for node ${nodeType}:${nodeId}`);

    // Deduplication guard: don't regenerate if identical source content already has cards
    const { count: existing } = await supabase
      .from('flashcards')
      .select('id', { count: 'exact', head: true })
      .eq('source_node_id', nodeId)
      .eq('source_node_type', nodeType)
      .eq('is_outdated', false);

    if (existing > 0) {
      const { data } = await supabase
        .from('flashcards')
        .select('*')
        .eq('source_node_id', nodeId)
        .eq('is_outdated', false);
      return data; // Return existing up-to-date cards
    }

    const prompt = `Generate exactly ${count} high-quality flashcards from this content. Return ONLY a JSON object.
Format: { "flashcards": [{ "front": "<question>", "back": "<concise answer>", "hint": "<optional hint>", "difficulty": "easy|medium|hard", "confidence": 0.0-1.0 }] }
confidence = how certain the generated content is correct (1.0 = definitively from source, 0.5 = inferred).

Content:
${content.substring(0, 3000)}`;

    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' }
    });

    let cards;
    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      cards = parsed.flashcards || parsed.cards || parsed;
      if (!Array.isArray(cards)) throw new Error('Expected array');
    } catch {
      throw new Error('Groq returned invalid JSON for flashcard generation');
    }

    const rows = cards.map(c => ({
      space_id: spaceId,
      source_node_id: nodeId,
      source_node_type: nodeType,
      front: c.front,
      back: c.back,
      hint: c.hint || null,
      difficulty: c.difficulty || 'medium',
      is_ai_generated: true,
      ai_metadata: buildAiMetadata([nodeId], c.confidence ?? null)
    }));

    const { data, error } = await supabase.from('flashcards').insert(rows).select();
    if (error) throw error;

    for (const card of data) {
      await graphService.createDeterministicEdge({
        sourceId: nodeId, sourceType: nodeType,
        targetId: card.id, targetType: 'flashcard',
        edgeType: 'contains'
      });
    }

    return data;
  }

  // ─── Quiz Generation ─────────────────────────────────────
  async generateQuiz(nodeId, nodeType, spaceId, questionCount = 5) {
    if (!groq) throw new Error("AI service is currently unavailable. Groq API key is not configured.");
    const content = await this._fetchNodeContent(nodeId, nodeType);
    if (!content) throw new Error(`Cannot fetch content for node ${nodeType}:${nodeId}`);

    const prompt = `Generate exactly ${questionCount} multiple-choice questions from this content. Return ONLY a JSON object.
Format: { "title": "<quiz title>", "confidence": 0.0-1.0, "questions": [{ "question": "<Q>", "options": [{"id":"a","text":"...","is_correct":false}, ...], "explanation": "<why correct answer>" }] }

Content:
${content.substring(0, 3000)}`;

    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    let quizData;
    try {
      quizData = JSON.parse(response.choices[0].message.content);
    } catch {
      throw new Error('Groq returned invalid JSON for quiz generation');
    }

    const { data: quiz, error: qError } = await supabase.from('quizzes').insert({
      space_id: spaceId,
      source_node_id: nodeId,
      source_node_type: nodeType,
      title: quizData.title || 'Knowledge Check',
      is_ai_generated: true,
      ai_metadata: buildAiMetadata([nodeId], quizData.confidence ?? null)
    }).select().single();
    if (qError) throw qError;

    const questionRows = (quizData.questions || []).map((q, i) => ({
      quiz_id: quiz.id,
      question: q.question,
      question_type: 'multiple_choice',
      options: q.options,
      explanation: q.explanation,
      order_index: i
    }));
    await supabase.from('quiz_questions').insert(questionRows);

    await graphService.createDeterministicEdge({
      sourceId: nodeId, sourceType: nodeType,
      targetId: quiz.id, targetType: 'quiz',
      edgeType: 'contains'
    });

    return quiz;
  }

  // ─── Summary Generation ──────────────────────────────────
  async generateSummary(nodeId, nodeType, complexityLevel = 'standard') {
    if (!groq) throw new Error("AI service is currently unavailable. Groq API key is not configured.");
    const content = await this._fetchNodeContent(nodeId, nodeType);
    if (!content) throw new Error(`Cannot fetch content for ${nodeType}:${nodeId}`);

    const levelInstructions = {
      simple: 'Explain in simple terms. Use short sentences. Avoid jargon. Suitable for a beginner.',
      standard: 'Write a clear, balanced summary. Cover key concepts concisely.',
      technical: 'Write a technical summary including implementation details, trade-offs, and nuances.'
    };

    const prompt = `${levelInstructions[complexityLevel]} Summarize this in 3–5 sentences maximum:\n\n${content.substring(0, 4000)}`;

    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: MODEL,
      temperature: 0.2,
      max_tokens: 400
    });

    const summaryText = response.choices[0].message.content;

    const { data, error } = await supabase.from('knowledge_summaries').upsert({
      source_node_id: nodeId,
      source_node_type: nodeType,
      content: summaryText,
      complexity_level: complexityLevel,
      is_ai_generated: true,
      ai_metadata: buildAiMetadata([nodeId])
    }, { onConflict: 'source_node_id,source_node_type,complexity_level' }).select().single();

    if (error) throw error;
    return data;
  }

  // ─── Regeneration: Process outdated artifacts ─────────────
  // Called by a background job when the regen queue has items.
  async processRegenQueue() {
    const { data: queue } = await supabase
      .from('artifact_regen_queue')
      .select('*')
      .is('processed_at', null)
      .order('queued_at', { ascending: true })
      .limit(20);

    if (!queue?.length) return 0;

    let processed = 0;
    for (const item of queue) {
      try {
        if (item.artifact_type === 'flashcard') {
          // Mark old ones outdated (already done by trigger) then regenerate
          await this.generateFlashcards(item.source_node_id, item.source_node_type, null);
        } else if (item.artifact_type === 'summary') {
          await this.generateSummary(item.source_node_id, item.source_node_type);
        }
        // Mark as processed
        await supabase.from('artifact_regen_queue')
          .update({ processed_at: new Date().toISOString() })
          .eq('id', item.id);
        processed++;
      } catch (err) {
        console.error(`[LearningEngine] Regen failed for ${item.artifact_type}:${item.source_node_id}`, err.message);
      }
    }
    return processed;
  }

  // ─── Context sufficiency check ────────────────────────────
  // Used by the AI Tutor to decide whether to add a low-context warning.
  async assessContextSufficiency(spaceId) {
    const { count } = await supabase
      .from('knowledge_edges')
      .select('id', { count: 'exact', head: true })
      .or(`target_id.eq.${spaceId},source_id.eq.${spaceId}`)
      .in('status', ['verified', 'inferred']);

    const { count: postCount } = await supabase
      .from('community_posts')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', spaceId)
      .eq('status', 'public');

    // Heuristic: a space with <5 posts and <10 edges has low context
    const isLowContext = (postCount ?? 0) < 5 && (count ?? 0) < 10;
    return { isLowContext, edgeCount: count, postCount };
  }

  // ─── Internal: Fetch node content ────────────────────────
  async _fetchNodeContent(nodeId, nodeType) {
    if (nodeType === 'post') {
      const { data } = await supabase.from('community_posts').select('title, content').eq('id', nodeId).single();
      return data ? `${data.title || ''}\n${data.content || ''}` : null;
    }
    if (nodeType === 'wiki') {
      const { data } = await supabase.from('space_wiki_pages').select('title, content').eq('id', nodeId).single();
      return data ? `${data.title}\n${data.content}` : null;
    }
    return null;
  }
}

module.exports = new LearningEngine();
