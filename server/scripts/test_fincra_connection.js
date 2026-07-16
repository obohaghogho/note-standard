const axios = require('axios');
require('dotenv').config({ path: './server/.env' });

/**
 * Standalone Fincra Auth Diagnostic Script
 * Run with: node server/scripts/test_fincra_connection.js
 */

async function testConnection() {
    const secretKey = (process.env.FINCRA_SECRET_KEY || '').trim();
    const publicKey = (process.env.FINCRA_PUBLIC_KEY || '').trim();
    const businessId = (process.env.FINCRA_BUSINESS_ID || '').trim();
    
    const isTest = secretKey.startsWith('sk_test');
    const baseUrl = isTest ? 'https://sandboxapi.fincra.com' : 'https://api.fincra.com';

    console.log('--- Fincra Diagnostic ---');
    console.log(`Environment: ${isTest ? 'SANDBOX' : 'PRODUCTION'}`);
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Secret Key Prefix: ${secretKey.substring(0, 7)}...`);
    console.log(`Public Key Prefix: ${publicKey.substring(0, 7)}...`);
    console.log(`Business ID: ${businessId || 'MISSING'}`);
    console.log('-------------------------');

    if (!secretKey || !publicKey) {
        console.error('❌ Error: Missing API keys in .env');
        return;
    }

    const client = axios.create({
        baseURL: baseUrl,
        headers: {
            'api-key': secretKey,
            'x-pub-key': publicKey,
            ...(businessId ? { 'x-business-id': businessId } : {}),
            'Content-Type': 'application/json',
            'accept': 'application/json'
        }
    });

    try {
        console.log('Testing authentication via /profile/business/details...');
        // This is a simple GET request that requires valid auth
        const response = await client.get('/profile/business/details');
        
        console.log('✅ Success! Authentication is valid.');
        console.log('Business Name:', response.data?.data?.businessName || 'N/A');
    } catch (error) {
        console.error('❌ Authentication Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            
            if (error.response.status === 401) {
                console.error('\nPossible Reasons:');
                console.log('1. Invalid Secret Key or Public Key.');
                console.log('2. IP not whitelisted in Fincra Dashboard (Dashboard > Settings > API Keys).');
                console.log('3. Mismatch between Key Environment and Base URL (e.g. sk_test with api.fincra.com).');
            }
        } else {
            console.error('Error Message:', error.message);
        }
    }
}

testConnection();
