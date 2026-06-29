const supabase = require('../../config/database');
const creatorAnalyticsService = require('../services/creator/CreatorAnalyticsService');
const graphService = require('../services/graph/GraphService');

exports.getDashboard = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const summary = await creatorAnalyticsService.getDashboardSummary(creatorId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
};

exports.getRecommendations = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { spaceId } = req.query; // Optional filter

    if (!spaceId) {
      // Pick their most active space
      const { data } = await supabase
        .from('community_spaces')
        .select('id')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return res.json({ recommendations: [] });
      const recs = await creatorAnalyticsService.getAiRecommendations(creatorId, data.id);
      return res.json({ recommendations: recs });
    }

    const recs = await creatorAnalyticsService.getAiRecommendations(creatorId, spaceId);
    res.json({ recommendations: recs });
  } catch (err) {
    next(err);
  }
};

exports.getDrafts = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { data, error } = await supabase
      .from('creator_drafts')
      .select('id, content_type, title, status, scheduled_publish_at, updated_at')
      .eq('creator_id', creatorId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json({ drafts: data });
  } catch (err) {
    next(err);
  }
};

exports.saveDraft = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { draftId, contentType, spaceId, title, contentPayload, status } = req.body;

    // Optional: compute a simple hash to see if we should create a new version
    const payloadStr = JSON.stringify(contentPayload || {});
    // Simple hash just for diffing
    let hash = 0;
    for (let i = 0; i < payloadStr.length; i++) {
      hash = ((hash << 5) - hash) + payloadStr.charCodeAt(i);
      hash |= 0;
    }
    const hashStr = hash.toString();

    let savedDraft;

    if (draftId) {
      // Update
      const { data: existing } = await supabase
        .from('creator_drafts')
        .select('autosave_hash, version')
        .eq('id', draftId)
        .eq('creator_id', creatorId)
        .single();

      if (!existing) return res.status(404).json({ error: 'Draft not found' });

      let newVersion = existing.version;
      
      // If content changed significantly (hash mismatch), maybe increment version
      // For now we just update in place to keep it simple, unless status goes to published.

      const { data, error } = await supabase
        .from('creator_drafts')
        .update({
          title,
          content_payload: contentPayload,
          status: status || 'draft',
          autosave_hash: hashStr,
          last_autosaved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', draftId)
        .select()
        .single();

      if (error) throw error;
      savedDraft = data;

    } else {
      // Create new
      const { data, error } = await supabase
        .from('creator_drafts')
        .insert({
          creator_id: creatorId,
          space_id: spaceId,
          content_type: contentType,
          title,
          content_payload: contentPayload,
          status: status || 'draft',
          autosave_hash: hashStr
        })
        .select()
        .single();

      if (error) throw error;
      savedDraft = data;
    }

    res.json({ draft: savedDraft });
  } catch (err) {
    next(err);
  }
};
