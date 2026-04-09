
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkGreyInstructions() {
  console.log('--- Checking grey_instructions Table ---');
  try {
    const { data, error } = await supabase
      .from('grey_instructions')
      .select('*');
    
    if (error) {
      if (error.code === '42P01') {
        console.error('Table grey_instructions does not exist');
      } else {
        console.error('Error fetching grey_instructions:', error.message);
      }
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('No instructions found in grey_instructions table.');
    } else {
      console.log(`Found ${data.length} instruction(s):`);
      data.forEach(inst => {
        console.log(`- ${inst.currency}: ${inst.bank_name} (${inst.account_number})`);
      });
    }
  } catch (err) {
    console.error('Unexpected error:', err.message);
  }
}

checkGreyInstructions();
