const axios = require('axios');

async function testDeposit() {
    try {
        const response = await axios.post('http://localhost:5001/api/wallet/deposit/transfer', {
            currency: 'NGN',
            amount: 1000
        }, {
            headers: {
                // We need a valid JWT if requireAuth is on
                // But maybe we can see the 500 even if it's a 401/403 first
            }
        });
        console.log('Response:', response.data);
    } catch (error) {
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

testDeposit();
