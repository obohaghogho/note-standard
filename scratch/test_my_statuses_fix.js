const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL || "https://tngcvgisfctggvivcnva.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function verifyMyStatusesFix() {
  console.log("Testing fixed GET /api/status/my logic against real DB data...");

  // Get a user ID from statuses table that has views
  const { data: statusViews } = await supabase
    .from('status_views')
    .select('status_id, viewer_id, viewed_at')
    .limit(5);

  if (!statusViews || statusViews.length === 0) {
    console.log("No status_views records found in DB to test.");
    return;
  }

  const sampleStatusId = statusViews[0].status_id;
  const { data: sampleStatus } = await supabase
    .from('statuses')
    .select('*')
    .eq('id', sampleStatusId)
    .single();

  if (!sampleStatus) {
    console.log("Sample status not found.");
    return;
  }

  const ownerId = sampleStatus.user_id;
  console.log(`Testing owner: ${ownerId}, status ID: ${sampleStatusId}`);

  // Execute the exact fixed logic
  const now = new Date().toISOString();
  const { data: statuses, error } = await supabase
    .from('statuses')
    .select('*')
    .eq('user_id', ownerId)
    .eq('is_deleted', false);

  if (error) {
    console.error("Error fetching statuses:", error);
    return;
  }

  const statusIds = (statuses || []).map(s => s.id);
  let allViews = [];
  let allReactions = [];

  if (statusIds.length > 0) {
    const { data: viewsData } = await supabase
      .from('status_views')
      .select('status_id, viewer_id, viewed_at, completed')
      .in('status_id', statusIds)
      .neq('viewer_id', ownerId)
      .order('viewed_at', { ascending: false });
    allViews = viewsData || [];

    const { data: reactionsData } = await supabase
      .from('status_reactions')
      .select('status_id, user_id, emoji')
      .in('status_id', statusIds);
    allReactions = reactionsData || [];
  }

  const profileIdsToFetch = [...new Set([
    ...allViews.map(v => v.viewer_id),
    ...allReactions.map(r => r.user_id)
  ])];

  const profileMap = {};
  if (profileIdsToFetch.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', profileIdsToFetch);
    (profiles || []).forEach(p => {
      profileMap[p.id] = p;
    });
  }

  const enriched = (statuses || []).map(s => {
    const statusViews = allViews.filter(v => v.status_id === s.id);
    const statusReactions = allReactions.filter(r => r.status_id === s.id);

    const viewersList = statusViews.map(v => {
      const prof = profileMap[v.viewer_id] || {};
      return {
        id: prof.id || v.viewer_id,
        display_name: prof.full_name || prof.username || 'User',
        username: prof.username,
        avatar_url: prof.avatar_url,
        viewed_at: v.viewed_at,
        completed: v.completed,
      };
    });

    return {
      id: s.id,
      view_count: statusViews.length,
      viewers: viewersList,
    };
  });

  console.log("Enriched statuses result:", JSON.stringify(enriched, null, 2));
}

verifyMyStatusesFix().catch(console.error);
