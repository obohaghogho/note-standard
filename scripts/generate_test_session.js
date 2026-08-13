const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL || "https://tngcvgisfctggvivcnva.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateSession() {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'obohoboh107@gmail.com',
    options: {
      redirectTo: 'http://localhost:5173/dashboard/feed'
    }
  });

  if (error) {
    console.error('Error generating link:', error);
    process.exit(1);
  }

  console.log('Action link:', data.properties.action_link);
  fs.writeFileSync(path.join(__dirname, 'magic_link.txt'), data.properties.action_link);
}

generateSession();
