const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');

async function testProd() {
  try {
    fs.writeFileSync('test.jpg', 'fake image content');
    const form = new FormData();
    form.append('file', fs.createReadStream('test.jpg'), { filename: 'test.jpg', contentType: 'image/jpeg' });

    const res = await axios.post('https://note-standard-api.onrender.com/api/upload/media', form, {
      headers: form.getHeaders(),
    });
    console.log('Success:', res.data);
  } catch (err) {
    console.log('Status:', err.response?.status);
    console.log('Error:', err.response?.data || err.message);
  }
}
testProd();
