/**
 * audit_endpoints.js
 * Inspect exact rows in device_installations and push_subscriptions for active users.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../realtime-gateway/.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectEndpoints() {
  console.log(`\n=== INSPECTING ALL DEVICE_INSTALLATIONS ROWS ===\n`);
  const { data: v2Data, error: v2Err } = await supabase
    .from('device_installations')
    .select('installation_id, device_id, platform, type, push_endpoint, endpoint_status, failure_reason, failure_count, last_seen_at');

  if (v2Err) {
    console.error('Error:', v2Err);
  } else {
    console.table(v2Data.map(d => ({
      device_id: d.device_id,
      platform: d.platform,
      type: d.type,
      status: d.endpoint_status,
      failure_reason: d.failure_reason,
      endpoint_prefix: d.push_endpoint ? d.push_endpoint.slice(0, 45) + '...' : 'NULL',
      last_seen: d.last_seen_at
    })));
  }

  console.log(`\n=== INSPECTING ALL PUSH_SUBSCRIPTIONS ROWS ===\n`);
  const { data: v1Data, error: v1Err } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, device_id, platform, status, endpoint, last_seen_at, created_at');

  if (v1Err) {
    console.error('Error:', v1Err);
  } else {
    console.table(v1Data.map(d => ({
      user_id: d.user_id ? d.user_id.slice(0, 8) : 'NULL',
      device_id: d.device_id,
      platform: d.platform,
      status: d.status,
      endpoint_prefix: d.endpoint ? d.endpoint.slice(0, 45) + '...' : 'NULL',
      last_seen: d.last_seen_at,
      created_at: d.created_at
    })));
  }
}

inspectEndpoints().catch(console.error);
