const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

async function testFlow() {
  const supabaseUrl = 'https://tngcvgisfctggvivcnva.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZ2N2Z2lzZmN0Z2d2aXZjbnZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MTQ3NDEsImV4cCI6MjA4MzE5MDc0MX0.OiAnFRVchVT9k037aipKFrc-zFs2UoYdBrSysMp2LCM';
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Try to create a dummy user
  const email = 'test_status_' + Date.now() + '@example.com';
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: 'password123',
    options: { data: { full_name: 'Test User' } }
  });
  
  if (signUpError) {
    console.log('SignUp error:', signUpError.message);
    return;
  }
  
  const token = signUpData.session.access_token;
  console.log('Logged in with', email);
  
  // Create status
  try {
    const payload = {
      type: 'video',
      media_url: 'https://res.cloudinary.com/dp8h4v7ni/video/upload/v1783289503/note_standard_statuses/rfuvmecckryuo3texz4e.mp4',
      content: 'test video status',
      privacy: 'contacts'
    };
    
    const res = await axios.post('https://note-standard-api.onrender.com/api/status', payload, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log('Status created:', res.data);
  } catch (err) {
    console.log('Status:', err.response?.status);
    console.log('Create status error:', err.response?.data || err.message);
  }
}

testFlow();
