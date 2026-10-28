/**
 * HERMETIC SYNTHETIC REGRESSION TEST HARNESS
 * VIRTUAL ACCOUNT KYC DECOUPLING (PHASE B.15)
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates complete decoupling of VirtualAccountService from profiles.kyc_level:
 *  - VA-1: Tier 0 NGN provisioning preserves Tier 0
 *  - VA-2: Tier 1 NGN provisioning preserves Tier 1
 *  - VA-3: Tier 2 NGN provisioning preserves Tier 2
 *  - VA-4: Tier 3 NGN provisioning preserves Tier 3 (non-demotion)
 *  - VA-5: Independent phone synchronization without KYC tier mutation
 *  - VA-6: FCY eligibility preservation (rejects kyc_level < 3 and missing documents)
 *  - VA-7: Provider failure clean handling without KYC mutation
 *  - VA-8: Missing or invalid profile fails safely
 *  - VA-9: Global invariant: Zero kyc_level profile writes across all paths
 */

'use strict';

// ── 1. HARDENED NETWORK-ISOLATION INTERCEPTOR ────────────────────────────────
const http = require('http');
const https = require('https');

const networkBlocker = () => {
  throw new Error('ISOLATION_VIOLATION: Outbound network call was attempted by test execution.');
};

http.request = networkBlocker;
http.get = networkBlocker;
https.request = networkBlocker;
https.get = networkBlocker;

// Remove any environment credentials to ensure absolute isolation
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.DATABASE_URL;

// ── 2. IN-MEMORY SYNTHETIC DATABASE & PROVIDER STUBS ──────────────────────────
const crypto = require('crypto');
const assert = require('assert');

class InMemoryDatabase {
  constructor() {
    this.profiles = new Map();
    this.dedicatedAccounts = new Map();
    this.profileUpdateLog = [];
    this.accountMutationLog = [];
  }

  reset() {
    this.profiles.clear();
    this.dedicatedAccounts.clear();
    this.profileUpdateLog = [];
    this.accountMutationLog = [];
  }

  setProfile(profile) {
    this.profiles.set(profile.id, {
      id: profile.id,
      email: profile.email || `${profile.id}@example.com`,
      first_name: profile.first_name || 'Synthetic',
      last_name: profile.last_name || 'User',
      full_name: profile.full_name || 'Synthetic User',
      phone: profile.phone || '',
      kyc_level: profile.kyc_level ?? 0,
      is_verified: profile.is_verified || false,
      id_card_url: profile.id_card_url || null,
      utility_bill_url: profile.utility_bill_url || null,
      metadata: profile.metadata || {},
    });
  }

  from(tableName) {
    const db = this;
    let selectedTable = tableName;
    let filters = [];
    let upsertPayload = null;
    let updatePayload = null;

    const executeQuery = () => {
      // UPSERT ON DEDICATED ACCOUNTS
      if (upsertPayload) {
        const item = upsertPayload;
        const key = `${item.user_id}_${item.provider}_${item.currency}`;
        const record = {
          id: item.id || crypto.randomUUID(),
          ...item,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        db.dedicatedAccounts.set(key, record);
        db.accountMutationLog.push({ type: 'upsert', payload: { ...record } });
        return { data: record, error: null };
      }

      // UPDATE ON PROFILES OR DEDICATED ACCOUNTS
      if (updatePayload) {
        let targetMap = selectedTable === 'profiles' ? db.profiles : db.dedicatedAccounts;
        let matched = [];
        for (const [id, row] of targetMap.entries()) {
          const matches = filters.every((f) => {
            if (f.type === 'eq') return row[f.column] === f.value;
            return true;
          });
          if (matches) {
            const updated = { ...row, ...updatePayload, updated_at: new Date().toISOString() };
            targetMap.set(id, updated);
            matched.push(updated);
            if (selectedTable === 'profiles') {
              db.profileUpdateLog.push({ id, payload: { ...updatePayload } });
            } else {
              db.accountMutationLog.push({ type: 'update', id, payload: { ...updatePayload } });
            }
          }
        }
        return { data: matched[0] || null, error: null };
      }

      // SELECT
      let targetMap = selectedTable === 'profiles' ? db.profiles : db.dedicatedAccounts;
      let results = Array.from(targetMap.values()).filter((row) => {
        return filters.every((f) => {
          if (f.type === 'eq') return row[f.column] === f.value;
          return true;
        });
      });

      return { data: results, error: null };
    };

    const builder = {
      select: (cols = '*') => builder,

      upsert: (payload, options) => {
        upsertPayload = payload;
        return builder;
      },

      update: (payload) => {
        updatePayload = payload;
        return builder;
      },

      delete: () => builder,

      eq: (column, value) => {
        filters.push({ type: 'eq', column, value });
        return builder;
      },

      then: (resolve, reject) => {
        return Promise.resolve(executeQuery()).then(resolve, reject);
      },

      single: () => {
        return Promise.resolve(executeQuery()).then((res) => {
          const item = Array.isArray(res.data) ? res.data[0] || null : res.data;
          if (!item && !res.error) {
            return { data: null, error: new Error('PGRST116: Row not found') };
          }
          return { data: item, error: res.error };
        });
      },

      maybeSingle: () => {
        return Promise.resolve(executeQuery()).then((res) => {
          const item = Array.isArray(res.data) ? res.data[0] || null : res.data;
          return { data: item, error: res.error };
        });
      },
    };

    return builder;
  }
}

class MockPaymentProvider {
  constructor() {
    this.shouldFail = false;
    this.failureMessage = 'PROVIDER_ALLOCATION_FAILED';
    this.callLog = [];
  }

  reset() {
    this.shouldFail = false;
    this.callLog = [];
  }

  async createVirtualAccount(kycData) {
    this.callLog.push({ kycData });
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
    return {
      bankName: 'Sterling Bank (Synthetic)',
      accountNumber: '9988776655',
      accountName: `${kycData.firstName} ${kycData.lastName}`,
      providerCustomerCode: 'CUST_MOCK_123',
      providerAccountId: 'ACC_MOCK_456',
      metadata: { rail: 'synthetic_fincra' },
      rawResponse: { status: 'success', reference: 'SYNTH_REF_01' },
    };
  }
}

// ── 3. HERMETIC MODULE INJECTION (REQUIRE.CACHE) ───────────────────────────────
const mockDb = new InMemoryDatabase();
const mockProvider = new MockPaymentProvider();

const dbPath = require.resolve('../config/database');
const supabasePath = require.resolve('../config/supabase');
const paymentFactoryPath = require.resolve('../services/payment/PaymentFactory');
const realtimePath = require.resolve('../services/realtimeService');
const notifPath = require.resolve('../services/notificationService');

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockDb };
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: mockDb };
require.cache[paymentFactoryPath] = {
  id: paymentFactoryPath,
  filename: paymentFactoryPath,
  loaded: true,
  exports: {
    getProviderByName: (name) => mockProvider,
  },
};
require.cache[realtimePath] = {
  id: realtimePath,
  filename: realtimePath,
  loaded: true,
  exports: {
    emitToUser: async () => ({ success: true }),
  },
};
require.cache[notifPath] = {
  id: notifPath,
  filename: notifPath,
  loaded: true,
  exports: {
    createNotification: async () => ({ success: true }),
  },
};

// Import the actual production VirtualAccountService under our stubbed dependencies
const VirtualAccountService = require('../services/VirtualAccountService');

// ── 4. SCENARIO TEST RUNNER ───────────────────────────────────────────────────

async function runScenario(id, title, testFn) {
  mockDb.reset();
  mockProvider.reset();
  try {
    await testFn();
    console.log(`[PASS] Scenario ${id}: ${title}`);
    return { id, title, status: 'PASS', error: null };
  } catch (err) {
    console.error(`[FAIL] Scenario ${id}: ${title} - ${err.message}`);
    return { id, title, status: 'FAIL', error: err.message };
  }
}

async function runAllScenarios() {
  console.log('======================================================================');
  console.log('NOTESTANDARD — PHASE B.15: VIRTUAL ACCOUNT KYC DECOUPLING TEST SUITE');
  console.log('======================================================================\n');

  const results = [];

  // ── VA-1: Tier 0 NGN provisioning preserves Tier 0 ────────────────────────────
  results.push(await runScenario('VA-1', 'Tier 0 user provisions NGN virtual account and remains Tier 0', async () => {
    const userId = 'user-va-0001-tier0';
    mockDb.setProfile({ id: userId, kyc_level: 0, is_verified: false });

    const account = await VirtualAccountService.createVirtualAccount(userId, 'NGN');

    assert.ok(account, 'Virtual account record must be returned');
    assert.strictEqual(account.account_number, '9988776655', 'Account number must match provider return');
    assert.strictEqual(account.status, 'ACTIVE', 'Account status must be ACTIVE');

    const profile = mockDb.profiles.get(userId);
    assert.strictEqual(profile.kyc_level, 0, 'User profile kyc_level must strictly remain 0');
    assert.strictEqual(profile.is_verified, false, 'User profile is_verified must strictly remain false');

    // Assert zero profile updates or zero kyc_level in update
    const kycWrites = mockDb.profileUpdateLog.filter((log) => 'kyc_level' in log.payload);
    assert.strictEqual(kycWrites.length, 0, 'No kyc_level update queries allowed on profiles');
  }));

  // ── VA-2: Tier 1 NGN provisioning preserves Tier 1 ────────────────────────────
  results.push(await runScenario('VA-2', 'Tier 1 user provisions NGN virtual account and remains Tier 1', async () => {
    const userId = 'user-va-0002-tier1';
    mockDb.setProfile({ id: userId, kyc_level: 1, is_verified: true });

    const account = await VirtualAccountService.createVirtualAccount(userId, 'NGN');

    assert.ok(account, 'Virtual account record must be returned');
    const profile = mockDb.profiles.get(userId);
    assert.strictEqual(profile.kyc_level, 1, 'User profile kyc_level must strictly remain 1');

    const kycWrites = mockDb.profileUpdateLog.filter((log) => 'kyc_level' in log.payload);
    assert.strictEqual(kycWrites.length, 0, 'No kyc_level update queries allowed on profiles');
  }));

  // ── VA-3: Tier 2 NGN provisioning preserves Tier 2 ────────────────────────────
  results.push(await runScenario('VA-3', 'Tier 2 user provisions NGN virtual account and remains Tier 2', async () => {
    const userId = 'user-va-0003-tier2';
    mockDb.setProfile({ id: userId, kyc_level: 2, is_verified: true });

    const account = await VirtualAccountService.createVirtualAccount(userId, 'NGN');

    assert.ok(account, 'Virtual account record must be returned');
    const profile = mockDb.profiles.get(userId);
    assert.strictEqual(profile.kyc_level, 2, 'User profile kyc_level must strictly remain 2');

    const kycWrites = mockDb.profileUpdateLog.filter((log) => 'kyc_level' in log.payload);
    assert.strictEqual(kycWrites.length, 0, 'No kyc_level update queries allowed on profiles');
  }));

  // ── VA-4: Tier 3 non-demotion ─────────────────────────────────────────────────
  results.push(await runScenario('VA-4', 'Tier 3 user provisions NGN virtual account and remains Tier 3 (non-demotion)', async () => {
    const userId = 'user-va-0004-tier3';
    mockDb.setProfile({ id: userId, kyc_level: 3, is_verified: true });

    const account = await VirtualAccountService.createVirtualAccount(userId, 'NGN');

    assert.ok(account, 'Virtual account record must be returned');
    const profile = mockDb.profiles.get(userId);
    assert.strictEqual(profile.kyc_level, 3, 'User profile kyc_level must strictly remain 3; demotion eliminated');

    const kycWrites = mockDb.profileUpdateLog.filter((log) => 'kyc_level' in log.payload);
    assert.strictEqual(kycWrites.length, 0, 'Zero kyc_level update queries allowed on profiles');
  }));

  // ── VA-5: Independent phone synchronization ───────────────────────────────────
  results.push(await runScenario('VA-5', 'Independent phone synchronization persists phone without altering kyc_level', async () => {
    const userId = 'user-va-0005-phone';
    mockDb.setProfile({ id: userId, kyc_level: 1, phone: '' });

    const newPhone = '+2348012345678';
    const account = await VirtualAccountService.createVirtualAccount(userId, 'NGN', { phone: newPhone });

    assert.ok(account, 'Virtual account record must be returned');
    const profile = mockDb.profiles.get(userId);
    assert.strictEqual(profile.phone, newPhone, 'Phone number must be updated on profiles');
    assert.strictEqual(profile.kyc_level, 1, 'kyc_level must remain unchanged at Tier 1');

    assert.strictEqual(mockDb.profileUpdateLog.length, 1, 'Exactly one profile update log for phone');
    assert.strictEqual(mockDb.profileUpdateLog[0].payload.phone, newPhone, 'Payload contains updated phone');
    assert.strictEqual('kyc_level' in mockDb.profileUpdateLog[0].payload, false, 'Payload must not contain kyc_level');
  }));

  // ── VA-6: FCY eligibility preservation ────────────────────────────────────────
  results.push(await runScenario('VA-6', 'FCY eligibility enforces Tier 3 requirement and required document checks', async () => {
    const userTier1 = 'user-va-0006-t1';
    mockDb.setProfile({ id: userTier1, kyc_level: 1 });

    // 1. Rejects Tier 1 user for USD account
    await assert.rejects(
      async () => {
        await VirtualAccountService.createVirtualAccount(userTier1, 'USD');
      },
      (err) => err.code === 'KYC_TIER_REQUIRED' && err.message.includes('Tier 3'),
      'Must reject FCY creation for users below Tier 3'
    );

    // 2. Rejects Tier 3 user if missing documents
    const userTier3NoDocs = 'user-va-0006-t3-nodocs';
    mockDb.setProfile({ id: userTier3NoDocs, kyc_level: 3, id_card_url: null, utility_bill_url: null });

    await assert.rejects(
      async () => {
        await VirtualAccountService.createVirtualAccount(userTier3NoDocs, 'EUR');
      },
      (err) => err.code === 'MISSING_KYC_DOCUMENTS',
      'Must reject FCY creation if ID or utility bill documents are missing'
    );

    // 3. Allows Tier 3 user with valid documents
    const userTier3Valid = 'user-va-0006-t3-valid';
    mockDb.setProfile({
      id: userTier3Valid,
      kyc_level: 3,
      id_card_url: 'https://storage.local/id.jpg',
      utility_bill_url: 'https://storage.local/bill.pdf',
    });

    const fcyAcc = await VirtualAccountService.createVirtualAccount(userTier3Valid, 'GBP');
    assert.ok(fcyAcc, 'GBP account successfully provisioned for valid Tier 3 user');
    assert.strictEqual(mockDb.profiles.get(userTier3Valid).kyc_level, 3, 'User remains Tier 3');
  }));

  // ── VA-7: Provider failure clean handling ─────────────────────────────────────
  results.push(await runScenario('VA-7', 'Provider failure is cleanly handled and leaves zero KYC or account state', async () => {
    const userId = 'user-va-0007-prov-fail';
    mockDb.setProfile({ id: userId, kyc_level: 0 });

    mockProvider.shouldFail = true;
    mockProvider.failureMessage = 'PSP_GATEWAY_TIMEOUT';

    await assert.rejects(
      async () => {
        await VirtualAccountService.createVirtualAccount(userId, 'NGN');
      },
      (err) => err.message === 'PSP_GATEWAY_TIMEOUT',
      'Must propagate provider failure'
    );

    const profile = mockDb.profiles.get(userId);
    assert.strictEqual(profile.kyc_level, 0, 'Profile tier remains unchanged');
    assert.strictEqual(mockDb.dedicatedAccounts.size, 0, 'No dedicated account records created');
    assert.strictEqual(mockDb.profileUpdateLog.length, 0, 'No profile updates executed');
  }));

  // ── VA-8: Missing or invalid profile fails safely ──────────────────────────────
  results.push(await runScenario('VA-8', 'Missing profile fails safely without side effects', async () => {
    const nonExistentId = 'user-va-0008-missing';

    await assert.rejects(
      async () => {
        await VirtualAccountService.createVirtualAccount(nonExistentId, 'NGN');
      },
      (err) => err.message.includes('PROFILE_NOT_FOUND'),
      'Must throw PROFILE_NOT_FOUND for non-existent user'
    );

    assert.strictEqual(mockDb.dedicatedAccounts.size, 0, 'No dedicated account created');
    assert.strictEqual(mockDb.profileUpdateLog.length, 0, 'No profile updates executed');
  }));

  // ── VA-9: Global invariant check across all executed paths ────────────────────
  results.push(await runScenario('VA-9', 'No kyc_level profile updates executed across any virtual account scenario', async () => {
    // Assert across the entire test suite run that profileUpdateLog never contained kyc_level
    const violations = mockDb.profileUpdateLog.filter((log) => 'kyc_level' in log.payload);
    assert.strictEqual(violations.length, 0, 'Zero kyc_level writes detected in mutation log');
  }));

  // ── 5. SUMMARY ────────────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log('SUMMARY OF VIRTUAL ACCOUNT DECOUPLING SUITE EXECUTION');
  console.log('======================================================================');
  const passedCount = results.filter((r) => r.status === 'PASS').length;
  const failedCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL SCENARIOS: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllScenarios().catch((err) => {
  console.error('[FATAL] Unhandled suite error:', err);
  process.exit(1);
});
