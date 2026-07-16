require('dotenv').config({ path: '../.env' });
const supabase = require('../config/database');

async function restoreFriends() {
  console.log('Starting friend restoration process...');
  
  try {
    // 1. Find all 'direct' conversations
    const { data: directConvs, error: convError } = await supabase
      .from('conversations')
      .select('id, type')
      .eq('type', 'direct');

    if (convError) throw convError;

    let restoredCount = 0;

    for (const conv of directConvs) {
      // 2. Count members
      const { data: members, error: memError } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conv.id);

      if (memError) throw memError;

      // 3. If there is only 1 member, we need to find the missing one
      if (members && members.length === 1) {
        const remainingMemberId = members[0].user_id;

        // Try to find the missing member from the messages table
        const { data: messages, error: msgError } = await supabase
          .from('messages')
          .select('sender_id')
          .eq('conversation_id', conv.id);

        if (!msgError && messages && messages.length > 0) {
          // Find the unique sender who is NOT the remaining member
          const missingMemberId = messages.find(m => m.sender_id !== remainingMemberId)?.sender_id;

          if (missingMemberId) {
            console.log(`Restoring missing member ${missingMemberId} for conversation ${conv.id}`);
            
            // Restore the missing member
            const { error: restoreError } = await supabase
              .from('conversation_members')
              .insert({
                conversation_id: conv.id,
                user_id: missingMemberId,
                role: 'member',
                status: 'accepted',
                // Set cleared_at to now, so it stays hidden until new message
                cleared_at: new Date().toISOString()
              });

            if (restoreError) {
              console.error(`Failed to restore member for ${conv.id}:`, restoreError.message);
            } else {
              restoredCount++;
            }
          }
        }
      }
    }

    console.log(`Friend restoration complete. Restored ${restoredCount} relationships.`);
    process.exit(0);
  } catch (err) {
    console.error('Fatal error during friend restoration:', err);
    process.exit(1);
  }
}

restoreFriends();
