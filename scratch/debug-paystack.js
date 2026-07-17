require('dotenv').config();
const axios = require('axios');

axios.interceptors.request.use(request => {
  console.log('Starting Request', JSON.stringify(request, null, 2))
  return request
})

axios.interceptors.response.use(response => {
  console.log('Response:', response.status)
  return response
}, error => {
  console.log('Response Error:', error.response ? error.response.status : error.message)
  return Promise.reject(error)
})

const PaystackProvider = require('../server/services/payment/providers/PaystackProvider');
const provider = new PaystackProvider();

provider.initialize({
  email: "test@example.com",
  amount: 1000,
  currency: "NGN",
  reference: "test_" + Date.now(),
  metadata: { test: true }
}).catch(console.error);
