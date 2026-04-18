/**
 * Fincra Production-Grade Auth Diagnostic
 * 
 * This script verifies your FINCRA_ENV and Authorization: Bearer setup.
 * Run with: node server/scripts/fincra_auth_test.js
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runDiagnostic() {
    const secretKey = (process.env.FINCRA_SECRET_KEY || "").trim();
    const env = (process.env.FINCRA_ENV || "").toLowerCase();
    const businessId = (process.env.FINCRA_BUSINESS_ID || "").trim();

    console.log('--- Fincra Auth Diagnostic ---');
    console.log(`Target Environment: ${env.toUpperCase() || "NOT SET"}`);
    console.log(`Secret Key Loaded: ${secretKey ? "YES (starts with " + secretKey.substring(0, 4) + "...)" : "NO"}`);
    console.log(`Business ID Loaded: ${businessId ? "YES" : "NO (Optional)"}`);

    if (!env || !["live", "production", "sandbox", "test"].includes(env)) {
        console.error('❌ ERROR: FINCRA_ENV is invalid or missing.');
        process.exit(1);
    }

    if (!secretKey) {
        console.error('❌ ERROR: FINCRA_SECRET_KEY is missing.');
        process.exit(1);
    }

    const baseUrl = (env === "live" || env === "production") 
        ? "https://api.fincra.com" 
        : "https://sandboxapi.fincra.com";

    console.log(`Base URL: ${baseUrl}`);
    console.log('Attempting authentication call to /profile/business/details...');

    try {
        const response = await axios.get(`${baseUrl}/profile/business/details`, {
            headers: {
                "Authorization": `Bearer ${secretKey}`,
                ...(businessId ? { "x-business-id": businessId } : {}),
                "Content-Type": "application/json",
                "accept": "application/json"
            }
        });

        console.log('✅ SUCCESS: Authentication valid.');
        console.log('Business Name:', response.data?.data?.businessName || "Unknown");
        console.log('Fincra Reference:', response.data?.data?.reference || "N/A");
    } catch (error) {
        console.error('❌ AUTHENTICATION FAILED');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Fincra Response:', JSON.stringify(error.response.data, null, 2));
            
            if (error.response.status === 401) {
                console.log('\nTIP: Double check your FINCRA_SECRET_KEY and ensure your Render IP is whitelisted in the Fincra Dashboard.');
            }
        } else {
            console.error('Error:', error.message);
        }
        process.exit(1);
    }
}

runDiagnostic();
