const axios = require('axios');
require('dotenv').config();

const secretKey = process.env.FINCRA_SECRET_KEY;
const businessId = process.env.FINCRA_BUSINESS_ID;
const baseUrl = "https://api.fincra.com";

async function testHeader(headerName) {
    console.log(`Testing header: ${headerName}`);
    try {
        const headers = {
            [headerName]: secretKey,
            "x-business-id": businessId,
            "Content-Type": "application/json"
        };
        await axios.post(`${baseUrl}/checkout/payments`, {
            customer: { name: "Audit User", email: "audit@example.com" },
            amount: 10, currency: "USD", reference: "test_" + Date.now(), 
            redirectUrl: "https://notestandard.com/success", feeBearer: "business"
        }, { headers });
        console.log(`SUCCESS with ${headerName}`);
        return true;
    } catch (error) {
        // Only return true if NOT 401
        if (error.response?.status !== 401) {
            console.log(`DEBUG: ${headerName} returned ${error.response?.status}`);
        }
        return false;
    }
}

async function run() {
    const list = ["api-key", "api_key", "apikey", "x-api-key", "x-api_key", "Authorization"];
    for (const h of list) {
        if (await testHeader(h)) break;
    }
}

run();
