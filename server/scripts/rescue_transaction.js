const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const paymentService = require('../services/payment/paymentService');

async function rescueTransaction() {
  const reference = 'tx_e8abaa2c52ff44f686c77342888cd647';
  console.log(`--- Rescuing Transaction: ${reference} ---`);
  
  try {
    const result = await paymentService.verifyPaymentStatus(reference);
    console.log('✅ Verification Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('❌ Rescue Failed:', err.message);
  }
}

rescueTransaction();
