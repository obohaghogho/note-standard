const axios = require('axios');

async function checkLiveServer() {
    try {
        console.log("Pinging new domain...");
        const res = await axios.get('https://notestandard.com/api/version');
        console.log("New Domain Response:", res.data);
    } catch (e) {
        console.log("Error pinging new domain:", e.message);
    }
}

checkLiveServer();
