import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the root environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../server/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// We need an admin client to bypass RLS and create confirmed users instantly
let adminClient: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Creates a fresh, isolated test user in the Supabase database.
 * Returns the user's login credentials.
 */
export async function createTestUser() {
  if (!adminClient) {
    throw new Error('Supabase Admin Client not initialized. Check your .env file.');
  }

  const id = nanoid(8);
  const email = `e2e_test_${id}@notestandard.test`;
  const password = `TestPass123!`;
  const username = `e2e_${id}`;

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      full_name: `E2E User ${id}`,
    }
  });

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }
  
  // Pause briefly for database triggers to complete (e.g. creating the Profile row)
  await new Promise(r => setTimeout(r, 200));

  return {
    id: data.user.id,
    email,
    password,
    username,
  };
}

/**
 * Deletes a test user from the Supabase database, cascading to their profile/messages.
 */
export async function deleteTestUser(userId: string) {
  if (!adminClient) return;
  await adminClient.auth.admin.deleteUser(userId);
}
