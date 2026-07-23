const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

async function testUpload() {
  try {
    fs.writeFileSync('test.jpg', 'fake image content');
    const form = new FormData();
    form.append('file', fs.createReadStream('test.jpg'));

    const response = await axios.post('http://localhost:4000/api/upload/media', form, {
      headers: form.getHeaders(),
    });
    console.log('Success:', response.data);
  } catch (err) {
    console.log('Error:', err.response?.data || err.message);
  }
}

testUpload();
