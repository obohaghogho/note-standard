require('dotenv').config();
const supabase = require('./config/supabase');

async function createTestUser() {
    const email = 'valid.email.user.12345@gmail.com';
    const password = 'Password123!';

    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        if (error) {
            require('fs').writeFileSync('user_creation_result.txt', `Error: ${error.message}`);
        } else {
            require('fs').writeFileSync('user_creation_result.txt', `Success: ${data.user.id}`);
        }
    } catch (err) {
        require('fs').writeFileSync('user_creation_result.txt', `Exception: ${err.message}`);
    }
}

createTestUser();
