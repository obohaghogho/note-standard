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
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_URL.includes('placeholder') && !SUPABASE_SERVICE_ROLE_KEY.includes('placeholder')) {
  try {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  } catch (e) {
    void e;
  }
}

/**
 * Creates a fresh, isolated test user in the Supabase database.
 * Returns the user's login credentials. Fallback to mock credentials if DB unavailable.
 */
export async function createTestUser() {
  const id = nanoid(8);
  const email = process.env.TEST_EMAIL || `e2e_test_${id}@notestandard.test`;
  const password = process.env.TEST_PASSWORD || `TestPass123!`;
  const username = `e2e_${id}`;

  if (!adminClient) {
    return {
      id: `mock_${id}`,
      email,
      password,
      username,
    };
  }

  try {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        full_name: `E2E User ${id}`,
      }
    });

    if (error || !data?.user) {
      return {
        id: `mock_${id}`,
        email,
        password,
        username,
      };
    }

    await new Promise(r => setTimeout(r, 200));

    return {
      id: data.user.id,
      email,
      password,
      username,
    };
  } catch (err) {
    void err;
    return {
      id: `mock_${id}`,
      email,
      password,
      username,
    };
  }
}

/**
 * Deletes a test user from the Supabase database, cascading to their profile/messages.
 */
export async function deleteTestUser(userId: string) {
  if (!adminClient || userId.startsWith('mock_')) return;
  try {
    await adminClient.auth.admin.deleteUser(userId);
  } catch (e) {
    void e;
  }
}
