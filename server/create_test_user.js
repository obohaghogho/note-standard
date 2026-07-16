require('dotenv').config(); // Load env vars first!
const supabase = require('./config/supabase');

async function createTestUser() {
    const email = `test_manual_${Date.now()}@example.com`;
    const password = 'Password123!';

    console.log(`Attempting to create user: ${email}`);

    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: 'Test Manual User',
                }
            }
        });

        if (error) {
            console.error('Error creating user:', error.message);
            process.exit(1);
        }

        console.log('User created successfully!');
        console.log('Email:', email);
        console.log('Password:', password);
        console.log('User ID:', data.user?.id);
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

createTestUser();
