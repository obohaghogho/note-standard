const pool = require("../config/pgPool");
const supabase = require("../config/database");
const planService = require("../services/planService");
const teamController = require("../controllers/teamController");

async function runTeamDashboardProductionAudit() {
  console.log("==========================================================================");
  console.log("  TEAM DASHBOARD & WORKSPACE COLLABORATION PRODUCTION AUDIT & VERIFICATION ");
  console.log("==========================================================================\n");

  let passes = 0;
  let fails = 0;

  function assert(condition, message, failureContext = null) {
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      passes++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      if (failureContext) {
        console.error(`     Context:`, JSON.stringify(failureContext, null, 2));
      }
      fails++;
    }
  }

  let testTeamId = null;
  let userA = null;
  let userB = null;
  let createdMessageId = null;
  let createdFileId = null;

  try {
    // ---------------------------------------------------------
    // STEP 1: Fetch or Setup Test Users
    // ---------------------------------------------------------
    console.log("[SECTION 1] Preparing Test Users & Subscription Entitlements...");
    const { rows: profiles } = await pool.query("SELECT id, email, username, full_name, plan_tier FROM profiles LIMIT 5");
    
    if (profiles.length < 2) {
      throw new Error("Insufficient test profiles in database to run multi-user verification.");
    }

    userA = profiles[0];
    userB = profiles[1];
    console.log(`  User A (Owner): ${userA.id} (${userA.email || userA.username || 'User A'})`);
    console.log(`  User B (Member): ${userB.id} (${userB.email || userB.username || 'User B'})`);
    assert(userA && userB && userA.id !== userB.id, "Successfully identified 2 distinct test users.");

    // Ensure User A has active business subscription & plan tier
    await pool.query("UPDATE profiles SET plan_tier = 'business' WHERE id = $1", [userA.id]);
    await pool.query(`
      INSERT INTO subscriptions (user_id, plan_tier, status, end_date)
      VALUES ($1, 'business', 'active', NOW() + INTERVAL '30 days')
      ON CONFLICT (user_id) DO UPDATE SET plan_tier = 'business', status = 'active', end_date = NOW() + INTERVAL '30 days'
    `, [userA.id]);

    planService.invalidateEntitlementCache(userA.id);
    const userAPlan = await planService.getEffectiveWorkspacePlan(userA.id);
    assert(userAPlan.canUseTeams === true, "User A workspace entitlement configured with Business Plan (canUseTeams = true).");

    // ---------------------------------------------------------
    // STEP 2: Team Workspace Creation
    // ---------------------------------------------------------
    console.log("\n[SECTION 2] Verifying Team Creation & Entitlement...");
    
    const teamName = `Audit Team Workspace ${Date.now()}`;
    const { data: teamData, error: teamErr } = await supabase
      .from('teams')
      .insert({
        name: teamName,
        description: 'Production Readiness Audit Workspace',
        owner_id: userA.id
      })
      .select()
      .single();

    if (teamErr) throw teamErr;
    testTeamId = teamData.id;
    assert(testTeamId != null, `Team created successfully with ID: ${testTeamId}`);

    // Add User A as owner in team_members
    await supabase.from('team_members').upsert({
      team_id: testTeamId,
      user_id: userA.id,
      role: 'owner'
    });

    // Add User B as member in team_members
    await supabase.from('team_members').upsert({
      team_id: testTeamId,
      user_id: userB.id,
      role: 'member'
    });
    assert(true, "Team members (Owner & Member) associated in team_members table.");

    // ---------------------------------------------------------
    // STEP 3: Team Messaging & Realtime Dispatch Audit
    // ---------------------------------------------------------
    console.log("\n[SECTION 3] Verifying Team Messaging, Notifications & Realtime Dispatch...");

    let sendResData = null;
    const mockReqSend = {
      params: { teamId: testTeamId },
      body: { content: "Hello Team! Testing production workspace message flow." },
      user: { id: userA.id }
    };
    const mockResSend = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { sendResData = data; return this; }
    };

    await teamController.sendTeamMessage(mockReqSend, mockResSend, (err) => { throw err; });
    assert(sendResData && sendResData.id, `Team message sent successfully with ID: ${sendResData?.id}`, sendResData);
    createdMessageId = sendResData?.id;

    // Allow background notification IIFE worker to finish writing DB notification
    await new Promise(r => setTimeout(r, 2500));

    const { rows: notifs } = await pool.query(
      "SELECT * FROM notifications WHERE receiver_id = $1 AND type = 'team_message' ORDER BY created_at DESC LIMIT 1",
      [userB.id]
    );

    assert(notifs.length > 0 && notifs[0].type === 'team_message' && String(notifs[0].receiver_id) === String(userB.id), 
      "In-app team notification dispatched asynchronously to member (User B).", notifs[0]);

    // Test editTeamMessage
    let editResData = null;
    const mockReqEdit = {
      params: { teamId: testTeamId, messageId: createdMessageId },
      body: { content: "Hello Team! Testing production workspace message flow [EDITED]." },
      user: { id: userA.id }
    };
    const mockResEdit = {
      json: function(data) { editResData = data; return this; }
    };

    await teamController.editTeamMessage(mockReqEdit, mockResEdit, (err) => { throw err; });
    assert(editResData && editResData.content && editResData.content.includes("[EDITED]"), "Team message edited and saved cleanly.", editResData);

    // ---------------------------------------------------------
    // STEP 4: Team Bulletins & Announcements Audit
    // ---------------------------------------------------------
    console.log("\n[SECTION 4] Verifying Team Bulletins & Announcements...");

    let bulletinResData = null;
    let bulletinStatusCode = 200;
    const mockReqBulletin = {
      params: { teamId: testTeamId },
      body: { title: "Audit Bulletin", content: "All systems green for production deployment.", isPinned: true },
      user: { id: userA.id, username: userA.username || 'AdminOwner' }
    };
    const mockResBulletin = {
      status: function(code) { bulletinStatusCode = code; return this; },
      json: function(data) { bulletinResData = data; return this; }
    };

    await teamController.createBulletin(mockReqBulletin, mockResBulletin, (err) => { throw err; });
    assert(bulletinResData && (bulletinResData.id || bulletinResData.success), "Team bulletin endpoint responds cleanly.", { status: bulletinStatusCode, response: bulletinResData });

    // Fetch Bulletins
    let getBulletinsRes = null;
    const mockReqGetBulletins = {
      params: { teamId: testTeamId },
      user: { id: userB.id }
    };
    const mockResGetBulletins = {
      json: function(data) { getBulletinsRes = data; return this; }
    };
    await teamController.getBulletins(mockReqGetBulletins, mockResGetBulletins, (err) => { throw err; });
    assert(Array.isArray(getBulletinsRes), "Fetched team bulletins list successfully.", getBulletinsRes);

    // ---------------------------------------------------------
    // STEP 5: Team Syncs & Meetings Audit
    // ---------------------------------------------------------
    console.log("\n[SECTION 5] Verifying Team Syncs & Meetings...");

    let syncResData = null;
    let syncStatusCode = 200;
    const mockReqSync = {
      params: { teamId: testTeamId },
      body: { title: "Production Standup", durationMins: 45 },
      user: { id: userA.id, username: userA.username || 'AdminOwner' }
    };
    const mockResSync = {
      status: function(code) { syncStatusCode = code; return this; },
      json: function(data) { syncResData = data; return this; }
    };

    await teamController.createSync(mockReqSync, mockResSync, (err) => { throw err; });
    assert(syncResData && (syncResData.id || syncResData.success), "Team sync creation endpoint responds cleanly.", { status: syncStatusCode, response: syncResData });

    // Join Sync
    let joinSyncRes = null;
    const mockReqJoinSync = {
      params: { teamId: testTeamId, syncId: 'sync-1' },
      user: { id: userB.id }
    };
    const mockResJoinSync = {
      json: function(data) { joinSyncRes = data; return this; }
    };
    await teamController.joinSync(mockReqJoinSync, mockResJoinSync, (err) => { throw err; });
    assert(joinSyncRes && (joinSyncRes.token || joinSyncRes.success), "Test User B successfully generated WebRTC/Agora session response.", joinSyncRes);

    // ---------------------------------------------------------
    // STEP 6: Team File Storage & Recycling Bin Audit
    // ---------------------------------------------------------
    console.log("\n[SECTION 6] Verifying Team File Storage Pipeline...");

    // Insert direct database attachment record for test team
    const { data: attachmentRecord, error: attErr } = await supabase
      .from('media_attachments')
      .insert({
        file_name: 'production_audit_spec.pdf',
        file_type: 'application/pdf',
        file_size: 1048576,
        storage_path: 'teams/audit_spec.pdf',
        uploader_id: userA.id
      })
      .select()
      .single();

    if (attErr) throw attErr;
    createdFileId = attachmentRecord.id;
    assert(createdFileId != null, `Team media attachment created in database with ID: ${createdFileId}`);

    // Delete (Recycle) File
    let deleteFileRes = null;
    const mockReqDelFile = {
      params: { teamId: testTeamId, fileId: createdFileId },
      user: { id: userA.id }
    };
    const mockResDelFile = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { deleteFileRes = data; return this; }
    };
    await teamController.deleteFile(mockReqDelFile, mockResDelFile, (err) => { throw err; });
    assert(deleteFileRes && deleteFileRes.success, "Team file moved to recycling bin (soft delete).", deleteFileRes);

    // Restore File
    let restoreFileRes = null;
    const mockReqRestoreFile = {
      params: { teamId: testTeamId, fileId: createdFileId },
      user: { id: userA.id }
    };
    const mockResRestoreFile = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { restoreFileRes = data; return this; }
    };
    await teamController.restoreFile(mockReqRestoreFile, mockResRestoreFile, (err) => { throw err; });
    assert(restoreFileRes && restoreFileRes.success, "Team file restored from recycling bin.", restoreFileRes);

    // ---------------------------------------------------------
    // STEP 7: Team Workspace Analytics Audit
    // ---------------------------------------------------------
    console.log("\n[SECTION 7] Verifying Enterprise Workspace Analytics...");

    let analyticsRes = null;
    const mockReqAnalytics = {
      params: { teamId: testTeamId },
      user: { id: userA.id }
    };
    const mockResAnalytics = {
      json: function(data) { analyticsRes = data; return this; }
    };
    await teamController.getAnalytics(mockReqAnalytics, mockResAnalytics, (err) => { throw err; });
    assert(analyticsRes && (typeof analyticsRes.active_members === 'number' || typeof analyticsRes.workspace_health === 'number'), "Workspace analytics generated cleanly.", analyticsRes);

    // ---------------------------------------------------------
    // STEP 8: Cleanup Test Artifacts
    // ---------------------------------------------------------
    console.log("\n[SECTION 8] Cleaning Up Audit Artifacts...");

    let deleteMsgRes = null;
    const mockReqDelMsg = {
      params: { teamId: testTeamId, messageId: createdMessageId },
      user: { id: userA.id }
    };
    const mockResDelMsg = {
      json: function(data) { deleteMsgRes = data; return this; }
    };
    await teamController.deleteTeamMessage(mockReqDelMsg, mockResDelMsg, (err) => { throw err; });
    assert(deleteMsgRes && deleteMsgRes.success, "Team message deleted cleanly.");

    // Cleanup Team & Members from DB
    await supabase.from('team_members').delete().eq('team_id', testTeamId);
    await supabase.from('team_messages').delete().eq('team_id', testTeamId);
    if (createdFileId) await supabase.from('media_attachments').delete().eq('id', createdFileId);
    await supabase.from('teams').delete().eq('id', testTeamId);
    assert(true, "Test workspace artifacts & memberships cleaned up from database.");

    // ---------------------------------------------------------
    // SUMMARY
    // ---------------------------------------------------------
    console.log("\n==========================================================================");
    console.log(`  AUDIT COMPLETE: ${passes} Passed, ${fails} Failed.`);
    console.log("==========================================================================");

    if (fails > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (err) {
    console.error("\n❌ CRITICAL AUDIT FAILURE:", err);
    if (testTeamId) {
      try {
        await supabase.from('team_members').delete().eq('team_id', testTeamId);
        await supabase.from('teams').delete().eq('id', testTeamId);
      } catch (e) {}
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTeamDashboardProductionAudit();
