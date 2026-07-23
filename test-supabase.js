require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');

async function testSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.log('No supabase credentials');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // 1. Get a valid user
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('id').limit(1);
  if (pErr) return console.log('Get profile error:', pErr);
  const userId = profiles[0].id;
  console.log('Got user id:', userId);
  
  // 2. Try inserting a media status
  const payload = {
    user_id: userId,
    type: 'video',
    content: 'test video',
    media_url: 'https://example.com/test.mp4',
    privacy: 'contacts'
  };
  
  const { data: status, error: sErr } = await supabase.from('statuses').insert(payload).select().single();
  if (sErr) {
    console.log('Insert status error:', sErr);
  } else {
    console.log('Inserted status:', status);
    // Cleanup
    await supabase.from('statuses').delete().eq('id', status.id);
  }
  
  // 3. Try inserting a text status
  const textPayload = {
    user_id: userId,
    type: 'text',
    content: 'test text',
    font_style: 'system-ui',
    font_size: 24,
    bg_color: '#000000',
    privacy: 'contacts'
  };
  
  const { data: txtStatus, error: txtErr } = await supabase.from('statuses').insert(textPayload).select().single();
  if (txtErr) {
    console.log('Insert text status error:', txtErr);
  } else {
    console.log('Inserted text status:', txtStatus);
    await supabase.from('statuses').delete().eq('id', txtStatus.id);
  }
}

testSupabase();
