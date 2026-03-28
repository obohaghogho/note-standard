require('dotenv').config({ path: '../.env' });
const PaymentService = require('../services/payment/paymentService');
const supabase = require('../config/database');

async function test() {
  try {
     const { data: user } = await supabase.from('profiles').select('id').limit(1).single();
     if (!user) { console.log("No user found"); return; }
     console.log("Using User ID:", user.id);
     
     const res = await PaymentService.initializePayment(
        user.id, 
        'test@example.com', 
        1000, 
        'USD', 
        { type: 'DEPOSIT' },
        { provider: 'fincra' }
     );
     console.log("Success:", res);
  } catch (err) {
     console.error("Error:", err.message);
     if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
  }
}
test();
