require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

async function testFlow() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.log('No supabase credentials');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Try to create a dummy user or login
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'password123'
  });
  
  if (error) {
    console.log('Login error:', error.message);
    return;
  }
  
  const token = data.session.access_token;
  console.log('Logged in!');
  
  // Create status
  try {
    const payload = {
      type: 'image',
      media_url: 'https://example.com/test.jpg',
      content: 'test status',
      privacy: 'contacts'
    };
    
    const res = await axios.post('https://note-standard-api.onrender.com/api/status', payload, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log('Status created:', res.data);
  } catch (err) {
    console.log('Create status error:', err.response?.data || err.message);
  }
}

testFlow();
