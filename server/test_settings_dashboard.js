require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'test';
const supabase = createClient(supabaseUrl, supabaseKey);

const API_URL = 'http://localhost:5001';

async function runSettingsApiTest() {
  console.log("=========================================");
  console.log("🚀 STARTING DASHBOARD SETTINGS INTEGRATION TEST");
  console.log("=========================================\n");

  const testEmail = `test_settings_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  let jwtToken = null;
  let userId = null;

  try {
    // 1. Create Test Account
    console.log(`[1] Creating new test account: ${testEmail}`);
    const { data: authData, error: signupError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
    });

    if (signupError) throw signupError;
    
    // In local dev, email might need to be auto-confirmed or we just sign in
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (signInError) throw signInError;
    
    jwtToken = signInData.session.access_token;
    userId = signInData.user.id;
    console.log(`✅ Account created. User ID: ${userId}\n`);

    // Setup Axios instance with Auth
    const api = axios.create({
      baseURL: API_URL,
      headers: { Authorization: `Bearer ${jwtToken}` }
    });

    // 2. Test Accept Terms (Required for dashboard access)
    console.log(`[2] Testing Accept Terms Endpoint...`);
    const termsRes = await api.post('/api/auth/accept-terms');
    console.log(`✅ Terms accepted: ${termsRes.data.success}\n`);

    // 3. Test Chat Language Preference Update (Chat Tab)
    console.log(`[3] Testing Chat & Language Settings (French)...`);
    const chatRes = await api.post('/api/chat/preference', { language: 'fr' });
    console.log(`✅ Preferred Language Updated to: ${chatRes.data.preferred_language}\n`);

    // 4. Test Data Export (Privacy Tab)
    console.log(`[4] Testing GDPR Data Export...`);
    const exportRes = await api.post('/api/auth/export');
    console.log(`✅ Data Exported. Included keys: ${Object.keys(exportRes.data).join(', ')}\n`);

    // 5. Test Profile Updates (Profile Tab - Simulating the Supabase client update)
    console.log(`[5] Testing Profile Info Updates...`);
    const { data: profileUpdate, error: profileError } = await supabase
      .from('profiles')
      .update({ username: 'testuser', full_name: 'Test Setup User' })
      .eq('id', userId)
      .select()
      .single();
    
    if (profileError) throw profileError;
    console.log(`✅ Profile updated. New Name: ${profileUpdate.full_name}\n`);

    // 6. Test Advertisement Checkout (Ads Tab - The bug we just fixed!)
    console.log(`[6] Testing Ad Checkout Integration (Free User → Pending Activation)...`);
    
    // First create a dummy ad
    const adRes = await api.post('/api/ads', {
      title: 'My Test Ad',
      content: 'This is an ad created in the test suite',
      tags: ['test']
    });
    const adId = adRes.data.id;
    console.log(`✅ Ad created. ID: ${adId}`);

    // Now test checkout (This crashed before our fixes)
    const checkoutRes = await api.post('/api/ads/pay', { adId: adId });
    console.log(`✅ Ad Checkout Session created: ${checkoutRes.data.url.substring(0, 50)}...\n`);

    // 7. Test Account Deletion (Security Tab)
    console.log(`[7] Testing Account Deletion (Right to be Forgotten)...`);
    const deleteRes = await api.delete('/api/auth/delete-account');
    console.log(`✅ Account Deletion successful: ${deleteRes.data.message}\n`);

    console.log("=========================================");
    console.log("🎉 ALL SETTINGS DASHBOARD FEATURES PASSED");
    console.log("=========================================");

  } catch (err) {
    console.error("\n❌ TEST FAILED:", err.response?.data || err.message);
    process.exit(1);
  }
}

runSettingsApiTest();
