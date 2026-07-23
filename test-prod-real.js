const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const https = require('https');

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, function(response) {
      response.pipe(file);
      file.on('finish', function() {
        file.close(resolve);
      });
    }).on('error', function(err) {
      fs.unlink(dest);
      reject(err);
    });
  });
}

async function testProd() {
  try {
    console.log('Downloading sample video...');
    await download('https://www.w3schools.com/html/mov_bbb.mp4', 'sample.mp4');
    
    console.log('Uploading sample video...');
    const form = new FormData();
    form.append('file', fs.createReadStream('sample.mp4'), { filename: 'sample.mp4', contentType: 'video/mp4' });

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
