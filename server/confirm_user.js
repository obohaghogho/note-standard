require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY // MUST use service key for admin updates
);

async function confirmUser() {
    const userId = '23d27c92-e259-47f3-9bd1-ad938c32f797';
    console.log(`Confirming user: ${userId}`);

    const { data, error } = await supabase.auth.admin.updateUserById(
        userId,
        { email_confirm: true }
    );

    if (error) {
        console.error('Error confirming user:', error.message);
    } else {
        console.log('User confirmed successfully!', data.user.email);
    }
}

confirmUser();
