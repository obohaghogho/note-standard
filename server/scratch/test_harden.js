const FincraProvider = require('../services/payment/providers/FincraProvider');
require('dotenv').config();

async function testHarden() {
    const provider = new FincraProvider();
    console.log("Testing Hardened Error Handling...");
    
    try {
        await provider.initialize({
            email: "test@example.com",
            amount: 10,
            currency: "USD",
            reference: "test_" + Date.now(),
            callbackUrl: "https://notestandard.com/success",
            metadata: { customerName: "Test User" }
        });
        console.log("SUCCESS (Unexpected for invalid keys)");
    } catch (error) {
        console.log("CAUGHT EXPECTED ERROR:");
        console.log("Status Code:", error.statusCode);
        console.log("Message:", error.message);
        console.log("Details:", JSON.stringify(error.details, null, 2));
    }
}

testHarden();
