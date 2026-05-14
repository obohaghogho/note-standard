require('dotenv').config({ path: './server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Check teams
  const { data: teams, error: teamsError } = await supabase.from('teams').select('id, name');
  console.log('Teams:', teamsError ? teamsError : teams.map(t => t.name));

  if (teams && teams.length > 0) {
    const teamId = teams[0].id;
    const { data: msgs, error: msgError } = await supabase
      .from('team_messages')
      .select(`
        *,
        attachment:media_attachments(*),
        reply_to:team_messages!reply_to_id(id, content, sender_id, created_at),
        profiles:sender_id (id, username, full_name, avatar_url)
      `)
      .eq('team_id', teamId)
      .limit(1);
    
    if (msgError) {
      console.log('Error hitting team_messages:', msgError);
    } else {
      console.log('Success hitting team_messages:', msgs);
    }
  }
}

run();
