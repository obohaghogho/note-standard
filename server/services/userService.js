const supabase = require('../config/database');

/**
 * Ensures that a user has a corresponding row in public.profiles.
 * If missing, fetches auth metadata and inserts a new profile and default wallets.
 * 
 * @param {string} userId - UUID of the user
 * @param {Object} [fallbackData] - Optional user object from auth token
 * @returns {Promise<Object|null>} The profile object
 */
async function ensureProfile(userId, fallbackData = null) {
  if (!userId) return null;

  try {
    // 1. Check if profile already exists
    const { data: existingProfile, error: fetchErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      return existingProfile;
    }

    console.log(`[UserService] Profile missing for user ${userId}. Attempting auto-provisioning...`);

    // 2. Extract metadata from fallbackData or fetch from Supabase Auth Admin
    let email = fallbackData?.email || null;
    let metadata = fallbackData?.user_metadata || fallbackData?.raw_user_meta_data || {};
    let fullName = metadata.full_name || metadata.fullName || fallbackData?.full_name || '';
    let username = metadata.username || null;

    if (!email || !username) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(userId);
        if (authUser?.user) {
          email = email || authUser.user.email;
          const authMeta = authUser.user.user_metadata || authUser.user.raw_user_meta_data || {};
          fullName = fullName || authMeta.full_name || '';
          username = username || authMeta.username;
        }
      } catch (adminErr) {
        console.warn(`[UserService] Could not fetch auth user via admin API for ${userId}:`, adminErr.message);
      }
    }

    // Fallback email/username generation if still missing
    if (!email) {
      email = `user_${userId.slice(0, 8)}@notestandard.app`;
    }

    if (!username) {
      const emailPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      username = `${emailPrefix}_${randomSuffix}`.toLowerCase();
    } else {
      username = username.trim().replace(/^@/, '').toLowerCase();
    }

    // 3. Insert Profile
    const newProfileData = {
      id: userId,
      email: email.toLowerCase(),
      username,
      full_name: fullName,
      user_consent: true,
      terms_accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let { data: insertedProfile, error: insertErr } = await supabase
      .from('profiles')
      .insert([newProfileData])
      .select('*')
      .maybeSingle();

    if (insertErr) {
      console.warn(`[UserService] Initial profile insert error for ${userId} (${insertErr.message}). Retrying with randomized username...`);
      // If username conflict, randomize username and retry
      newProfileData.username = `${username}_${Math.floor(1000 + Math.random() * 9000)}`;
      const retryRes = await supabase
        .from('profiles')
        .insert([newProfileData])
        .select('*')
        .maybeSingle();
      
      if (retryRes.error) {
        console.error(`[UserService] Fatal: Failed to insert profile for user ${userId}:`, retryRes.error.message);
        return null;
      }
      insertedProfile = retryRes.data;
    }

    console.log(`[UserService] Successfully auto-provisioned profile for user ${userId} (@${newProfileData.username})`);

    // 4. Proactively ensure default wallets exist in wallets_store
    try {
      await supabase.from('wallets_store').insert([
        { user_id: userId, currency: 'USD', network: 'native', balance: 0, available_balance: 0, address: `${userId}_usd` },
        { user_id: userId, currency: 'BTC', network: 'bitcoin', balance: 0, available_balance: 0, address: `${userId}_btc` },
        { user_id: userId, currency: 'ETH', network: 'ethereum', balance: 0, available_balance: 0, address: `${userId}_eth` },
        { user_id: userId, currency: 'USDT', network: 'TRC20', balance: 0, available_balance: 0, address: `${userId}_usdt` },
        { user_id: userId, currency: 'USDC', network: 'ERC20', balance: 0, available_balance: 0, address: `${userId}_usdc` },
        { user_id: userId, currency: 'NGN', network: 'native', balance: 0, available_balance: 0, address: `${userId}_ngn` },
      ]);
    } catch (wErr) {
      console.warn(`[UserService] Wallet auto-creation warning for ${userId}:`, wErr.message);
    }

    return insertedProfile;
  } catch (err) {
    console.error(`[UserService] ensureProfile exception for ${userId}:`, err.message);
    return null;
  }
}

module.exports = {
  ensureProfile
};
