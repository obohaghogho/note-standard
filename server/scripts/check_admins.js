require('dotenv').config({ path: '../.env' });
const supabase = require('../config/database');

async function checkAdmins() {
  const { data } = await supabase.from('profiles').select('id, full_name, plan_tier').limit(5);
  console.log(data);
}
checkAdmins();
