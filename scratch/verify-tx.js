require('dotenv').config();
const PaystackProvider = require('../server/services/payment/providers/PaystackProvider');

async function run() {
  try {
    const provider = new PaystackProvider();
    const result = await provider.verifyPayment("tx_081d2f6492ff49b8b5e638e908fdc6ba");
    console.log("Paystack Status:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error);
  }
}
run();
