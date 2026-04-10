
const axios = require('axios');
require('dotenv').config({ path: './server/.env' });

async function testFincra() {
    const secretKey = process.env.FINCRA_SECRET_KEY;
    const publicKey = process.env.FINCRA_PUBLIC_KEY;
    const businessId = process.env.FINCRA_BUSINESS_ID;

    console.log("Fincra Config:", {
        secretKey: secretKey ? secretKey.substring(0, 5) + "..." : "MISSING",
        publicKey: publicKey ? publicKey.substring(0, 5) + "..." : "MISSING",
        businessId: businessId || "MISSING"
    });

    const isTest = (secretKey && (secretKey.startsWith("sk_test_") || secretKey.startsWith("pk_test_"))) ||
                   (publicKey && publicKey.startsWith("pk_test_"));
    
    const baseUrl = "https://sandboxapi.fincra.com";
    console.log("Using BaseURL:", baseUrl);

    const client = axios.create({
        baseURL: "https://api.fincra.com",
        headers: {
            "api-key": (secretKey || "").trim(),
            "x-business-id": (businessId || "").trim(),
            "Content-Type": "application/json",
            "accept": "application/json",
        },
    });

    try {
        const response = await client.post("/checkout/payments", {
            customer: {
                name: "Test User",
                email: "test@example.com",
            },
            amount: 10,
            currency: "USD",
            reference: "test_" + Date.now(),
            redirectUrl: "http://localhost:5173/payment/success",
            feeBearer: "business",
            metadata: {
                userId: "test_user_id",
            },
        });
        console.log("Fincra Success:", response.data);
    } catch (error) {
        console.error("Fincra Failure:", error.response?.data || error.message);
    }
}

testFincra();
