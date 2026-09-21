const supabase = require('../config/database');

async function search210and160() {
  console.log("Searching all fincra_transactions where amount in (160, 210, 260, 110) or gross_amount in (160, 210, 260, 110)...");

  const { data: fincraMatches, error: fErr } = await supabase
    .from('fincra_transactions')
    .select('*')
    .or('amount.eq.160,amount.eq.210,amount.eq.260,amount.eq.110,gross_amount.eq.160,gross_amount.eq.210,gross_amount.eq.260,gross_amount.eq.110');

  console.log("Fincra matches:", JSON.stringify(fincraMatches, null, 2));

  const { data: txMatches, error: tErr } = await supabase
    .from('transactions')
    .select('*')
    .or('amount.eq.160,amount.eq.210,amount.eq.260,amount.eq.110');

  console.log("Transactions matches:", JSON.stringify(txMatches, null, 2));

  // Search profiles associated with these user_ids
  const userIds = new Set();
  (fincraMatches || []).forEach(m => userIds.add(m.user_id));
  (txMatches || []).forEach(m => userIds.add(m.user_id));

  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', Array.from(userIds));
    console.log("Profiles for matched user_ids:", JSON.stringify(profiles, null, 2));

    const { data: wallets } = await supabase
      .from('wallets_store')
      .select('*')
      .in('user_id', Array.from(userIds));
    console.log("Wallets for matched user_ids:", JSON.stringify(wallets, null, 2));
  }
}

search210and160()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
