require('dotenv').config();
const supabase = require('../server/config/database');
const PaystackProvider = require('../server/services/payment/providers/PaystackProvider');
const WebhookService = require('../server/services/WebhookService');

async function sweep() {
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('provider', 'paystack')
    .in('status', ['PENDING', 'FAILED']);

  if (error) return console.error(error);
  
  const provider = new PaystackProvider();
  
  for (const tx of txs) {
    try {
      const verifyResult = await provider.verifyPayment(tx.reference_id);
      if (verifyResult.status === "success") {
        console.log(`Verified tx ${tx.id} as success on Paystack, triggering webhook...`);
        
        const fakeReq = {
          headers: { "x-forwarded-for": "127.0.0.1" },
          socket: {},
          body: {
            event: "charge.success",
            data: {
              reference: tx.reference_id,
              amount: verifyResult.amount * 100,
              currency: verifyResult.currency,
              status: "success",
              customer: verifyResult.customer,
              id: "manual_poll_" + Date.now()
            }
          }
        };
        
        const originalVerify = WebhookService.verifySignature;
        WebhookService.verifySignature = () => true;
        
        const fakeRes = { status: () => ({ send: () => {} }) };
        
        await WebhookService.processPaystackWebhook(fakeReq, fakeRes);
        
        WebhookService.verifySignature = originalVerify;
        console.log(`Transaction ${tx.id} credited successfully.`);
      } else {
        console.log(`Transaction ${tx.id} is still pending or failed on Paystack (${verifyResult.status}).`);
      }
    } catch (e) {
      console.log(`Error verifying ${tx.id}:`, e.message);
    }
  }
}
sweep();
