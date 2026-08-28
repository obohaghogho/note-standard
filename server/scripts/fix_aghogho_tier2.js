require('dotenv').config({ path: '../.env' });
const crypto = require('crypto');
const supabase = require('../config/database');

async function fixAghoghoTier2() {
  const userId = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd';
  console.log(`Starting Tier 2 promotion and record repair for user ${userId} (Aghogho jossy oboh)...`);

  // 1. Promote profile kyc_level to 2 & is_verified to true
  const { data: updatedProfile, error: profErr } = await supabase
    .from('profiles')
    .update({
      kyc_level: 2,
      is_verified: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, full_name, email, kyc_level, is_verified')
    .single();

  if (profErr) {
    console.error('❌ Failed to update profile:', profErr.message);
    process.exit(1);
  }

  console.log('✅ Profile updated successfully:', JSON.stringify(updatedProfile, null, 2));

  // 2. Insert persistent approved Tier 2 KYC request with valid UUID
  const requestId = crypto.randomUUID();
  const kycReqData = {
    id: requestId,
    user_id: userId,
    requested_tier: 2,
    status: 'APPROVED',
    residential_address: { note: 'Tier 2 BVN & DOB Verification Approved' },
    reviewed_at: new Date().toISOString(),
    reviewer_notes: 'Server-Authoritative Tier 2 BVN & DOB verification approved',
    submitted_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: insertedReq, error: reqErr } = await supabase
    .from('kyc_verification_requests')
    .insert(kycReqData)
    .select()
    .single();

  if (reqErr) {
    console.error('❌ Failed to insert KYC request into DB:', reqErr.message);
    process.exit(1);
  }

  console.log('✅ KYC verification request record created successfully:', JSON.stringify(insertedReq, null, 2));
  console.log('\n🎉 SUCCESS: User Aghogho jossy oboh is now officially Tier 2 Verified in NoteStandard production database!');
}

fixAghoghoTier2();
