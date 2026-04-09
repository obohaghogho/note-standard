const PaymentService = require("./server/services/payment/paymentService");
const PaymentFactory = require("./server/services/payment/PaymentFactory");

async function testCardDeposit() {
    console.log("--- Payment Service Diagnostic ---");
    
    // 1. Mock parameters
    const userId = "085f1c48-2b81-4cd3-8408-0599a9a349b1"; // Test user
    const email = "test@example.com";
    const amount = 10;
    const currency = "USD";
    const metadata = { method: "card" };
    
    try {
        console.log(`[Test] Selecting provider for ${currency} card...`);
        const provider = PaymentFactory.getProvider(currency, "NG", false, "card");
        console.log(`[Test] Selected Provider: ${provider.constructor.name}`);
        
        if (provider.constructor.name !== "FincraProvider") {
            console.error("FAILED: Expected FincraProvider for USD card");
        } else {
            console.log("SUCCESS: Correct provider selection logic");
        }
        
    } catch (err) {
        console.error("[Test] ERROR during provider selection:", err.message);
    }
}

testCardDeposit();
