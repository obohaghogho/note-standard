require('dotenv').config();
const walletService = require('./services/walletService');
const supabase = require('./config/database');

async function test() {
  try {
    const { data: profiles } = await supabase.from('profiles').select('id, email, username').limit(2);
    const sender = profiles[0];
    const receiver = profiles[1];

    await supabase.from('wallets_store').update({ balance: 10, available_balance: 10 }).eq('user_id', sender.id).eq('currency', 'BTC');

    console.log(`Sending to Receiver Username: ${receiver.username}`);
    
    console.log("Attempting transfer via Username (recipientId in payload)...");
    const res = await walletService.transferInternal(sender.id, 'FREE', {
      recipientId: receiver.username, // UI sends the raw input if it's not email/address/uuid
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
