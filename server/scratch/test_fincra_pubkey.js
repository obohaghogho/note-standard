const axios = require('axios');
require('dotenv').config();

const publicKey = process.env.FINCRA_PUBLIC_KEY;
const businessId = process.env.FINCRA_BUSINESS_ID;
const baseUrl = "https://api.fincra.com";

async function testPublicKeyAuth() {
    console.log("Testing Fincra Initialize Checkout (Public Key Header)...");
    
    const headers = {
        "x-pub-key": publicKey,
        "x-business-id": businessId,
        "Content-Type": "application/json"
    };

    const payload = {
        customer: {
            name: "Audit User",
            email: "audit@example.com"
        },
        amount: 10,
        currency: "USD",
        reference: "audit_" + Date.now(),
        redirectUrl: "https://notestandard.com/success",
        feeBearer: "business"
    };

    try {
        const response = await axios.post(`${baseUrl}/checkout/payments`, payload, { headers });
        console.log("SUCCESS!");
        console.log("Checkout URL:", response.data.data?.link);
    } catch (error) {
        console.error("FAILED!");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Message:", error.message);
        }
    }
}

testPublicKeyAuth();
