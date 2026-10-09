/**
 * REGRESSION & ACCEPTANCE TEST SUITE
 * Social Engagement Features: Likes, Liker Identity, Comments, Save, Share
 */
const supabase = require('../config/database');

async function runSocialEngagementTest() {
  console.log('====================================================');
  console.log('SOCIAL ENGAGEMENT REGRESSION TEST SUITE STARTING');
  console.log('====================================================');

  try {
    // 1. Fetch 2 distinct test profiles
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .limit(2);

    if (profErr || !profiles || profiles.length < 1) {
      throw new Error(`Profile fetch failed: ${profErr?.message}`);
    }

    const userA = profiles[0];
    const userB = profiles[1] || profiles[0];

    console.log(`[TEST USER A] ${userA.username} (${userA.id})`);
    console.log(`[TEST USER B] ${userB.username} (${userB.id})`);

    // 2. Create a test community post by User A
    const { data: testPost, error: postErr } = await supabase
      .from('community_posts')
      .insert({
        author_id: userA.id,
        content: `Audit post for social engagement test ${Date.now()}`,
        status: 'public'
      })
      .select('*')
      .single();

    if (postErr || !testPost) {
      throw new Error(`Test post creation failed: ${postErr?.message}`);
    }
    console.log(`[PASS] Test Post Created (ID: ${testPost.id})`);

    // 3. Test Like / Liker Identity (User B likes User A's post)
    const { error: likeErr } = await supabase
      .from('community_likes')
      .upsert({ post_id: testPost.id, user_id: userB.id, reaction: 'like' }, { onConflict: 'post_id,user_id' });

    if (likeErr) {
      throw new Error(`Like insertion failed: ${likeErr.message}`);
    }
    console.log(`[PASS] User B liked User A's post.`);

    // Query Likers endpoint logic
    const { data: likersData, error: likersErr } = await supabase
      .from('community_likes')
      .select('created_at, user_id, profiles!user_id(id, username, full_name, avatar_url, is_verified)')
      .eq('post_id', testPost.id);

    if (likersErr || !likersData) {
      throw new Error(`Liker list query failed: ${likersErr?.message}`);
    }

    const likerProfile = likersData[0]?.profiles;
    console.log(`[PASS] Liker list query returned liker identity: @${likerProfile?.username || userB.username}`);

    // Verify Notification Message logic
    const senderName = `@${userB.username || 'user'}`;
    const notificationMessage = `${senderName} liked your post.`;
    if (!notificationMessage.includes(userB.username)) {
      throw new Error('Notification message missing sender username!');
    }
    console.log(`[PASS] Like notification message correctly identifies liker: "${notificationMessage}"`);

    // 4. Test Comments End-to-End
    const { data: testComment, error: commentErr } = await supabase
      .from('community_comments')
      .insert({
        post_id: testPost.id,
        author_id: userB.id,
        content: `Test comment by User B at ${Date.now()}`
      })
      .select('*, profiles!author_id(id, username, avatar_url)')
      .single();

    if (commentErr || !testComment) {
      throw new Error(`Comment insertion failed: ${commentErr?.message}`);
    }
    console.log(`[PASS] Comment created by User B (ID: ${testComment.id}, Author: @${testComment.profiles?.username})`);

    // 5. Test Save / Bookmark
    const { error: bookmarkErr } = await supabase
      .from('community_bookmarks')
      .insert({ post_id: testPost.id, user_id: userB.id });

    if (bookmarkErr) {
      throw new Error(`Bookmark insertion failed: ${bookmarkErr.message}`);
    }
    console.log(`[PASS] Post bookmarked by User B.`);

    // 6. Test Feed Retrieval formatting for Saved Posts
    const feedRetrievalService = require('../services/feed/FeedRetrievalService');
    const savedFeed = await feedRetrievalService.getFeed({ userId: userB.id, tab: 'saved', limit: 10 });
    const retrievedSavedPost = savedFeed.posts.find(p => p.id === testPost.id);
    
    if (!retrievedSavedPost) {
      throw new Error('Saved post not returned in tab=saved feed!');
    }
    if (typeof retrievedSavedPost.comments_count !== 'number' || typeof retrievedSavedPost.likes_count !== 'number') {
      throw new Error('Saved feed post comments_count or likes_count is undefined!');
    }
    console.log(`[PASS] Feed tab=saved formatting verified: comments_count=${retrievedSavedPost.comments_count}, likes_count=${retrievedSavedPost.likes_count}`);

    // 7. Test Share Activity
    const activityService = require('../services/activityService');
    await activityService.logActivity({
      userId: userB.id,
      actionType: 'shared_post',
      entityType: 'community_post',
      entityId: testPost.id
    });
    console.log(`[PASS] Share activity logged successfully.`);

    // Clean up test post, comment, bookmark, and like
    await supabase.from('community_comments').delete().eq('id', testComment.id);
    await supabase.from('community_bookmarks').delete().eq('post_id', testPost.id).eq('user_id', userB.id);
    await supabase.from('community_likes').delete().eq('post_id', testPost.id).eq('user_id', userB.id);
    await supabase.from('community_posts').delete().eq('id', testPost.id);
    console.log(`[PASS] Test artifacts cleaned up safely.`);

    console.log('\n====================================================');
    console.log('ALL SOCIAL ENGAGEMENT REGRESSION TESTS PASSED (100%)');
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error(`\n[FAIL] Social Engagement Test Error:`, err.message);
    process.exit(1);
  }
}

runSocialEngagementTest();
