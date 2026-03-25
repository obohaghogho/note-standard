const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.development') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetPassword() {
    const userId = '23d27c92-e259-47f3-9bd1-ad938c32f797';
    const newPassword = 'Password123!';

    console.log(`--- Resetting Password for User ID: ${userId} ---`);
    const { data, error } = await supabase.auth.admin.updateUserById(
        userId,
        { password: newPassword }
    );

    if (error) {
        console.error('Error resetting password:', JSON.stringify(error, null, 2));
        return;
    }

    console.log('Password reset successfully for user:', data.user.email);
}

resetPassword().catch(console.error);
