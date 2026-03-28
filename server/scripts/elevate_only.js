require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function elevate() {
  const userId = '0573be74-5bd6-4a83-b23f-064d65995345';
  console.log(`Elevating user ${userId}...`);

  const { error } = await supabase
    .from('profiles')
    .update({ 
        role: 'admin',
        status: 'active'
    })
    .eq('id', userId);

  if (error) {
    console.error('Error:', error.message);
    return;
  }
  console.log('✓ Elevation successful!');
}

elevate();
