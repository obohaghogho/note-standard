const axios = require('axios');

async function testPostStatus() {
  try {
    // 1. Log in to get token
    const { data: auth } = await axios.post('https://note-standard-api.onrender.com/api/users/login', {
      email: 'test@example.com',
      password: 'password123'
    });
    console.log('Login success');
  } catch (err) {
    console.log('Login failed:', err.response?.data || err.message);
  }
}
testPostStatus();
