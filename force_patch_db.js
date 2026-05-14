require('dotenv').config({ path: './server/.env' });
const { Client } = require('pg');

async function forcePatchDatabase() {
    const connectionString = process.env.DATABASE_URL;
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        console.log("Connected to live database. Applying forceful RLS patches...");

        // 1. Fix conversation_members
        await client.query(`DROP POLICY IF EXISTS "Members can view all conversation participants" ON conversation_members;`);
        await client.query(`DROP POLICY IF EXISTS "Members can view conversation members" ON conversation_members;`);
        
        await client.query(`
            CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
            RETURNS boolean
            LANGUAGE sql
            SECURITY DEFINER
            SET search_path = public
            AS $$
              SELECT EXISTS (
                SELECT 1 FROM conversation_members
                WHERE conversation_id = conv_id
                AND user_id = auth.uid()
              );
            $$;
        `);

        await client.query(`
            CREATE POLICY "Members can view all conversation participants" 
            ON conversation_members FOR SELECT
            USING ( public.is_conversation_member(conversation_id) );
        `);
        console.log("✅ Fixed conversation_members recursion.");

        // 2. Fix team_members
        await client.query(`DROP POLICY IF EXISTS "Team members can view members" ON team_members;`);
        await client.query(`DROP POLICY IF EXISTS "Users can view team members" ON team_members;`);

        await client.query(`
            CREATE OR REPLACE FUNCTION public.is_team_member(t_id uuid)
            RETURNS boolean
            LANGUAGE sql
            SECURITY DEFINER
            SET search_path = public
            AS $$
              SELECT EXISTS (
                SELECT 1 FROM team_members
                WHERE team_id = t_id
                AND user_id = auth.uid()
              );
            $$;
        `);

        await client.query(`
            CREATE POLICY "Team members can view members" 
            ON team_members FOR SELECT
            USING ( public.is_team_member(team_id) );
        `);
        console.log("✅ Fixed team_members recursion.");

        console.log("🎉 All infinite recursion policies have been eradicated!");
    } catch (e) {
        console.error("Failed to patch database:", e);
    } finally {
        await client.end();
    }
}

forcePatchDatabase();
