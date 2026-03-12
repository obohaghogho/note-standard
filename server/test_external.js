require('dotenv').config();
const walletService = require('./services/walletService');
const supabase = require('./config/database');

async function test() {
  try {
    const { data: profiles } = await supabase.from('profiles').select('id, email, username').limit(1);
    const sender = profiles[0];

    await supabase.from('wallets_store').update({ balance: 10, available_balance: 10 }).eq('user_id', sender.id).eq('currency', 'BTC');

    const externalAddress = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'; // valid segwit btc dummy address
    console.log(`Sending to External Address: ${externalAddress}`);
    
    console.log("Attempting transfer via External Address...");
    const res = await walletService.transferInternal(sender.id, 'FREE', {
      recipientAddress: externalAddress,
      amount: 1,
      currency: 'BTC',
      network: 'NATIVE'
    });
    console.log("Transfer result:", res);

  } catch (e) {
    console.error("Test Error:", e.message);
  }
}

test();
