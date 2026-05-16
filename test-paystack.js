const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Load .env from server directory
dotenv.config({ path: path.join(__dirname, 'server', '.env') });

const secretKey = process.env.PAYSTACK_SECRET_KEY;

if (!secretKey) {
  console.error('❌ PAYSTACK_SECRET_KEY not found in .env');
  process.exit(1);
}

async function testPaystack() {
  console.log('--- Paystack Connectivity Test ---');
  console.log(`Key Prefix: ${secretKey.substring(0, 7)}...`);
  
  try {
    const response = await axios.get('https://api.paystack.co/balance', {
      headers: {
        Authorization: `Bearer ${secretKey}`
      }
    });
    
    console.log('✅ Connection Successful!');
    console.log('Status:', response.data.status ? 'OK' : 'Error');
    console.log('Message:', response.data.message);
    
    if (response.data.data) {
      console.log('Currency:', response.data.data[0]?.currency);
      console.log('Balance:', (response.data.data[0]?.balance / 100).toFixed(2));
    }
  } catch (error) {
    console.error('❌ Connection Failed!');
    if (error.response) {
      console.error('Status Code:', error.response.status);
      console.error('Error Data:', error.response.data);
    } else {
      console.error('Error Message:', error.message);
    }
  }
}

testPaystack();
