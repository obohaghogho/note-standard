const supabase = require('../config/database');
const creatorAnalyticsService = require('../services/creator/CreatorAnalyticsService');
const graphService = require('../services/graph/GraphService');
const { CREATOR_CATEGORIES, ALLOWED_SOCIAL_PLATFORMS } = require('../constants/creatorCategories');

exports.getDashboard = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const period = req.query.period || '30d';
    const summary = await creatorAnalyticsService.getConsolidatedDashboard(creatorId, period);
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
      .select('id, content_type, space_id, title, content_payload, status, scheduled_publish_at, updated_at')
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

exports.deleteDraft = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { id } = req.params;

    const { error } = await supabase
      .from('creator_drafts')
      .delete()
      .eq('id', id)
      .eq('creator_id', creatorId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.getReelsAnalytics = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const period = req.query.period || '30d';

    const analytics = await creatorAnalyticsService.getReelsPortfolioAnalytics(creatorId, period);
    res.json({ success: true, ...analytics });
  } catch (err) {
    next(err);
  }
};

exports.getSingleReelAnalytics = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { reelId } = req.params;

    if (!reelId) {
      return res.status(400).json({ error: 'Reel ID is required' });
    }

    const analytics = await creatorAnalyticsService.getSingleReelAnalytics(creatorId, reelId);
    res.json({ success: true, ...analytics });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.toggleCreatorMode = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { creator_mode_enabled, creator_category, social_links } = req.body;

    if (creator_mode_enabled !== undefined && typeof creator_mode_enabled !== 'boolean') {
      return res.status(400).json({ error: 'creator_mode_enabled must be a boolean' });
    }

    if (creator_category !== undefined && creator_category !== null && creator_category !== '') {
      if (!CREATOR_CATEGORIES.includes(creator_category)) {
        return res.status(400).json({ error: 'Invalid creator category' });
      }
    }

    let sanitizedSocialLinks = undefined;
    if (social_links !== undefined && social_links !== null) {
      if (typeof social_links !== 'object' || Array.isArray(social_links)) {
        return res.status(400).json({ error: 'social_links must be an object' });
      }

      const keys = Object.keys(social_links);
      for (const key of keys) {
        if (!ALLOWED_SOCIAL_PLATFORMS.includes(key)) {
          return res.status(400).json({ error: `Invalid social platform key: ${key}` });
        }

        const urlVal = social_links[key];
        if (urlVal !== undefined && urlVal !== null && urlVal !== '') {
          if (typeof urlVal !== 'string' || urlVal.length > 255) {
            return res.status(400).json({ error: `Invalid URL length for ${key}` });
          }

          if (!urlVal.startsWith('https://')) {
            return res.status(400).json({ error: `Invalid social link URL for ${key}: HTTPS required` });
          }

          if (urlVal.includes('javascript:') || urlVal.includes('data:')) {
            return res.status(400).json({ error: `Malicious URL scheme detected for ${key}` });
          }

          try {
            const parsedUrl = new URL(urlVal);
            if (parsedUrl.protocol !== 'https:') {
              return res.status(400).json({ error: `Invalid protocol for ${key}` });
            }
            const host = parsedUrl.hostname.toLowerCase();
            if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.startsWith('192.168.') || host.startsWith('10.')) {
              return res.status(400).json({ error: `Loopback/Private IP addresses rejected for ${key}` });
            }
          } catch (e) {
            return res.status(400).json({ error: `Malformed URL for ${key}` });
          }
        }
      }

      sanitizedSocialLinks = {};
      for (const k of ALLOWED_SOCIAL_PLATFORMS) {
        if (social_links[k] !== undefined && social_links[k] !== null && social_links[k] !== '') {
          sanitizedSocialLinks[k] = String(social_links[k]).trim();
        }
      }
    }

    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('is_creator, creator_mode_enabled, creator_category, creator_onboarded_at, social_links')
      .eq('id', userId)
      .single();

    if (fetchErr || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const modeEnabled = typeof creator_mode_enabled === 'boolean' ? creator_mode_enabled : profile.creator_mode_enabled;
    const newIsCreator = profile.is_creator || modeEnabled;
    const newOnboardedAt = profile.creator_onboarded_at || (newIsCreator ? new Date().toISOString() : null);
    const newCategory = (creator_category !== undefined && creator_category !== null && creator_category !== '') ? creator_category : profile.creator_category;
    const newSocialLinks = sanitizedSocialLinks !== undefined ? sanitizedSocialLinks : (profile.social_links || {});

    const { data: updated, error: updateErr } = await supabase
      .from('profiles')
      .update({
        is_creator: newIsCreator,
        creator_mode_enabled: modeEnabled,
        creator_category: newCategory,
        creator_onboarded_at: newOnboardedAt,
        social_links: newSocialLinks,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('is_creator, creator_mode_enabled, creator_category, creator_onboarded_at, social_links')
      .single();

    if (updateErr) {
      throw updateErr;
    }

    return res.json({
      success: true,
      is_creator: updated.is_creator,
      creator_mode_enabled: updated.creator_mode_enabled,
      creator_category: updated.creator_category,
      creator_onboarded_at: updated.creator_onboarded_at,
      social_links: updated.social_links
    });
  } catch (err) {
    next(err);
  }
};
