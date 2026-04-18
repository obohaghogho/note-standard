const axios = require('axios');
require('dotenv').config();

const secretKey = process.env.FINCRA_SECRET_KEY;
const businessId = process.env.FINCRA_BUSINESS_ID;
const baseUrl = "https://api.fincra.com";

async function testMinimalist() {
    console.log("Testing Minimalist Fincra Auth...");
    
    // Only EXACT headers required by docs
    const headers = {
        "api-key": secretKey,
        "x-business-id": businessId,
        "Content-Type": "application/json"
    };

    const payload = {
        customer: { name: "Audit User", email: "audit@example.com" },
        amount: 10,
        currency: "USD",
        reference: "audit_" + Date.now(),
        redirectUrl: "https://notestandard.com/success",
        feeBearer: "business"
    };

    try {
        const response = await axios.post(`${baseUrl}/checkout/payments`, payload, { headers });
        console.log("SUCCESS!");
        console.log("Link:", response.data.data?.link);
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

testMinimalist();
