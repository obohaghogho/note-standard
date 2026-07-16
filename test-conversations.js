const supabase = require('./server/config/database');

async function test() {
    console.log("Testing RPC...");
    // Let's get an active user ID
    const { data: users } = await supabase.from('profiles').select('id').limit(1);
    if (!users || !users.length) {
        console.log("No users found");
        return;
    }
    const userId = users[0].id;
    console.log("User ID:", userId);
    
    const { data, error } = await supabase.rpc('rpc_get_conversations', { p_user_id: userId });
    console.log("RPC Error:", error);
    console.log("RPC Data type:", typeof data, Array.isArray(data));
    console.log("RPC Data:", JSON.stringify(data, null, 2));
}

test();
