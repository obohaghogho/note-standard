const axios = require('axios');

async function checkLiveServer() {
    try {
        console.log("Pinging live Render server...");
        const res = await axios.get('https://note-standard-api.onrender.com/api/version');
        console.log("Live Server Response:", res.data);
    } catch (e) {
        console.log("Error pinging live server:", e.message);
    }
}

checkLiveServer();
