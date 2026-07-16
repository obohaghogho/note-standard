const axios = require('axios');
const supabase = require('./server/config/database');

async function testApi() {
    // 1. Get a user
    const { data: users } = await supabase.from('profiles').select('id, username').limit(1);
    if (!users || !users.length) return;
    const user = users[0];
    
    console.log("Found user:", user.id);
    
    // 2. Generate a valid JWT token using the backend's auth Service
    // We can just use the auth controller logic or JWT sign manually if we know the secret
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET || 'fallback', // Wait, we need the actual secret
        { expiresIn: "1d" }
    );
    
    try {
        const { app } = require('./server/app.js'); // Wait, we can just call the controller directly to see what it does
        
        const chatController = require('./server/controllers/chatController.js');
        const req = { user: { id: user.id } };
        const res = {
            json: (data) => console.log("Success, returned length:", data.length),
            status: (code) => {
                console.log("Status called:", code);
                return { json: (data) => console.log("Error JSON:", data) };
            }
        };
        
        await chatController.getConversations(req, res);
    } catch (e) {
        console.error("Test error:", e);
    }
}

require('dotenv').config({path: './server/.env'});
testApi();
