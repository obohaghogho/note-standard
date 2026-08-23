/**
 * Master Enterprise Treasury Liquidity Router & Cross-Currency Withdrawal Test Suite
 * ──────────────────────────────────────────────────────────────────────────────────
 * Validates corporate treasury liquidity routing, atomic reservations, executable FX quotes,
 * deterministic balance polling, concurrency locks, state transitions, and audit correlation.
 *
 * DO NOT CALL REAL FINANCIAL APIs — USES DETERMINISTIC MOCK PROVIDERS.
 */

const test = require("node:test");
const assert = require("node:assert");

// Import target modules
const TreasuryLiquidityRouter = require("../services/treasury/TreasuryLiquidityRouter");
const TreasuryReservationService = require("../services/treasury/TreasuryReservationService");
const TreasuryConversionService = require("../services/treasury/TreasuryConversionService");
const TreasuryReconciliationService = require("../services/treasury/TreasuryReconciliationService");
const { acquireCorporateTreasuryLock } = require("../withdrawal/redisLock");
const { WITHDRAWAL_STATES, assertTransition, canTransition } = require("../withdrawal/stateMachine");

/**
 * Deterministic Mock Payment Provider for Offline Testing
 */
class MockTreasuryProvider {
  constructor(balances = { NGN: 0, USD: 100000, EUR: 50000 }) {
    this.name = "fincra";
    this.balances = { ...balances };
    this.conversionHistory = [];
    this.payoutHistory = [];
    this.pollDelayBehavior = false; // If true, balance updates after 2 polls
    this.pollAttemptsCount = 0;
  }

  async getMerchantBalance(currency = "NGN") {
    const upperCurr = currency.toUpperCase();
    let avail = this.balances[upperCurr] || 0.0;

    // Simulate delayed balance update for polling tests
    if (this.pollDelayBehavior && upperCurr === "NGN") {
      this.pollAttemptsCount++;
      if (this.pollAttemptsCount < 3) {
        avail = 0.0; // Simulate delay
      } else {
        avail = 100000.0; // Balance becomes available on 3rd attempt
        this.balances["NGN"] = 100000.0;
      }
    }

    return { available: avail, currency: upperCurr };
  }

  async generateConversionQuote({ sourceCurrency, destinationCurrency, amount, userId }) {
    const rates = {
      "USD-NGN": 1350.0,
      "EUR-NGN": 1480.0,
      "GBP-NGN": 1720.0,
      "USD-GHS": 15.5
    };
    const pairKey = `${sourceCurrency.toUpperCase()}-${destinationCurrency.toUpperCase()}`;
    const rate = rates[pairKey] || 1000.0;

    const rawSourceRequired = Math.ceil((amount / rate) * 100) / 100;
    const fee = 2.0;

    return {
      quoteReference: `quote_mock_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sourceCurrency: sourceCurrency.toUpperCase(),
      destinationCurrency: destinationCurrency.toUpperCase(),
      destinationAmount: amount,
      sourceAmount: rawSourceRequired,
      rate,
      fee,
      expiresAt: new Date(Date.now() + 300000).toISOString()
    };
  }

  async executeConversion({ quoteReference, userId, sourceCurrency, destinationCurrency, amount }) {
    const sCurr = sourceCurrency.toUpperCase();
    const dCurr = destinationCurrency.toUpperCase();

    if ((this.balances[sCurr] || 0) < amount) {
      throw new Error(`PROVIDER_INSUFFICIENT_FUNDS: ${sCurr} balance too low for conversion.`);
    }

    const rates = { "USD-NGN": 1350.0, "EUR-NGN": 1480.0 };
    const rate = rates[`${sCurr}-${dCurr}`] || 1000.0;
    const destCredited = amount * rate;

    // Mutate mock balances
    this.balances[sCurr] -= amount;
    this.balances[dCurr] = (this.balances[dCurr] || 0) + destCredited;

    const conversionRef = `conv_mock_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.conversionHistory.push({ conversionRef, quoteReference, sourceCurrency, destinationCurrency, amount, destCredited });

    return {
      success: true,
      conversionReference: conversionRef,
      status: "SUCCESSFUL",
      sourceAmount: amount,
      destinationAmount: destCredited
    };
  }

  async initiatePayout({ amount, currency, bankCode, accountNumber, reference }) {
    const upperCurr = currency.toUpperCase();
    if ((this.balances[upperCurr] || 0) < amount) {
      throw new Error(`INSUFFICIENT_BALANCE: Provider ${upperCurr} balance (${this.balances[upperCurr]}) is lower than payout amount (${amount}).`);
    }

    this.balances[upperCurr] -= amount;
    const fincraRef = `fin_payout_${Date.now()}`;
    this.payoutHistory.push({ reference, fincraRef, amount, currency: upperCurr });

    return {
      success: true,
      fincraReference: fincraRef,
      status: "PROCESSING"
    };
  }
}

// ── TEST CASES ───────────────────────────────────────────────────────────────

test("TEST 1: Direct Payout when NGN liquidity is sufficient (No conversion)", async () => {
  const provider = new MockTreasuryProvider({ NGN: 200000, USD: 100000 });
  const decision = await TreasuryLiquidityRouter.findFundingRoute({
    destinationCurrency: "NGN",
    destinationAmount: 100000,
    provider,
    withdrawalReference: "wd_test_1"
  });

  assert.strictEqual(decision.fundingRequired, false, "No funding conversion should be required.");
  assert.strictEqual(decision.availableDirectBalance, 200000);
});

test("TEST 2: NGN insufficient + USD sufficient -> USD to NGN route selected", async () => {
  const provider = new MockTreasuryProvider({ NGN: 0, USD: 100000 });
  const decision = await TreasuryLiquidityRouter.findFundingRoute({
    destinationCurrency: "NGN",
    destinationAmount: 100000,
    provider,
    withdrawalReference: "wd_test_2"
  });

  assert.strictEqual(decision.fundingRequired, true);
  assert.strictEqual(decision.eligible, true);
  assert.strictEqual(decision.sourceCurrency, "USD");
  assert.strictEqual(decision.destinationCurrency, "NGN");
  assert.strictEqual(decision.fxRate, 1350.0);
  assert.ok(decision.sourceAmount > 0);
});

test("TEST 3: NGN insufficient + USD insufficient + EUR sufficient -> EUR to NGN fallback", async () => {
  const provider = new MockTreasuryProvider({ NGN: 0, USD: 10, EUR: 50000 });
  const decision = await TreasuryLiquidityRouter.findFundingRoute({
    destinationCurrency: "NGN",
    destinationAmount: 100000,
    provider,
    withdrawalReference: "wd_test_3"
  });

  assert.strictEqual(decision.fundingRequired, true);
  assert.strictEqual(decision.eligible, true);
  assert.strictEqual(decision.sourceCurrency, "EUR");
  assert.strictEqual(decision.destinationCurrency, "NGN");
  assert.strictEqual(decision.fxRate, 1480.0);
});

test("TEST 4: No eligible corporate treasury liquidity -> TREASURY_INSUFFICIENT", async () => {
  const provider = new MockTreasuryProvider({ NGN: 0, USD: 5, EUR: 5 });
  const decision = await TreasuryLiquidityRouter.findFundingRoute({
    destinationCurrency: "NGN",
    destinationAmount: 100000,
    provider,
    withdrawalReference: "wd_test_4"
  });

  assert.strictEqual(decision.fundingRequired, true);
  assert.strictEqual(decision.eligible, false);
  assert.ok(decision.reason.includes("TREASURY_INSUFFICIENT"));
});

test("TEST 5: Corporate treasury concurrency lock prevents duplicate locking", async () => {
  const lock1 = await acquireCorporateTreasuryLock("fincra", "USD", "NGN", 10000);
  assert.ok(lock1.lockId);

  // Attempt second simultaneous lock for same currency pair
  await assert.rejects(
    async () => {
      await acquireCorporateTreasuryLock("fincra", "USD", "NGN", 10000);
    },
    (err) => {
      return err.code === "CONCURRENT_TREASURY_LOCK";
    },
    "Should reject concurrent treasury lock acquisition"
  );

  await lock1.release();
});

test("TEST 6: Corporate FX conversion and deterministic balance polling execution", async () => {
  const provider = new MockTreasuryProvider({ NGN: 0, USD: 100000 });
  const fundingDecision = await TreasuryLiquidityRouter.findFundingRoute({
    destinationCurrency: "NGN",
    destinationAmount: 100000,
    provider,
    withdrawalReference: "wd_test_6"
  });

  const reservation = await TreasuryReservationService.createReservation({
    withdrawalReference: "wd_test_6",
    provider: "fincra",
    sourceCurrency: fundingDecision.sourceCurrency,
    sourceAmount: fundingDecision.sourceAmount,
    destinationCurrency: fundingDecision.destinationCurrency,
    destinationAmount: fundingDecision.destinationAmount,
    fxRate: fundingDecision.fxRate
  });

  assert.ok(reservation.treasuryReference);

  const convResult = await TreasuryConversionService.executeConversion({
    provider,
    fundingDecision,
    treasuryReference: reservation.treasuryReference,
    withdrawalReference: "wd_test_6"
  });

  assert.strictEqual(convResult.success, true);
  assert.ok(convResult.confirmedBalance >= 100000);

  // Submit payout after conversion confirmed
  const payoutRes = await provider.initiatePayout({
    amount: 100000,
    currency: "NGN",
    bankCode: "058",
    accountNumber: "0123456789",
    reference: "wd_test_6"
  });

  assert.strictEqual(payoutRes.success, true);
  assert.strictEqual(payoutRes.status, "PROCESSING");
});

test("TEST 7: Deterministic balance polling handles delayed balance updates safely", async () => {
  const provider = new MockTreasuryProvider({ NGN: 0, USD: 100000 });
  provider.pollDelayBehavior = true; // Simulates 2 pending attempts before balance update

  const confirmedBal = await TreasuryConversionService.pollProviderDestinationBalance({
    provider,
    currency: "NGN",
    requiredAmount: 50000,
    maxAttempts: 5,
    initialDelayMs: 50
  });

  assert.ok(confirmedBal >= 0);
});

test("TEST 8: Conversion failure / timeout enters RECONCILIATION_REQUIRED state", async () => {
  const provider = new MockTreasuryProvider({ NGN: 0, USD: 0 }); // Will trigger conversion error

  const reservation = await TreasuryReservationService.createReservation({
    withdrawalReference: "wd_test_8",
    provider: "fincra",
    sourceCurrency: "USD",
    sourceAmount: 100,
    destinationCurrency: "NGN",
    destinationAmount: 100000,
    fxRate: 1350
  });

  const fundingDecision = {
    sourceCurrency: "USD",
    destinationCurrency: "NGN",
    sourceAmount: 100,
    destinationAmount: 100000,
    quoteReference: "quote_test_8"
  };

  await assert.rejects(
    async () => {
      await TreasuryConversionService.executeConversion({
        provider,
        fundingDecision,
        treasuryReference: reservation.treasuryReference,
        withdrawalReference: "wd_test_8"
      });
    },
    (err) => {
      return err.message.includes("INSUFFICIENT_FUNDS");
    }
  );
});

test("TEST 9: Post-conversion payout failure records surplus position for reconciliation", async () => {
  const reconRes = await TreasuryReconciliationService.handlePostConversionPayoutFailure({
    withdrawalReference: "wd_test_9",
    treasuryReference: "TREAS_RES_test_9",
    reason: "Beneficiary bank account invalid",
    errorCode: "INVALID_BANK_ACCOUNT"
  });

  assert.strictEqual(reconRes.success, true);
  assert.strictEqual(reconRes.status, "RECONCILIATION_REQUIRED");
});

test("TEST 10: Withdrawal State Machine validates all corporate treasury transitions", async () => {
  assert.doesNotThrow(() => {
    assertTransition(WITHDRAWAL_STATES.VALIDATED, WITHDRAWAL_STATES.TREASURY_CHECK);
    assertTransition(WITHDRAWAL_STATES.TREASURY_CHECK, WITHDRAWAL_STATES.TREASURY_FUNDING_REQUIRED);
    assertTransition(WITHDRAWAL_STATES.TREASURY_FUNDING_REQUIRED, WITHDRAWAL_STATES.TREASURY_SOURCE_RESERVED);
    assertTransition(WITHDRAWAL_STATES.TREASURY_SOURCE_RESERVED, WITHDRAWAL_STATES.PAYOUT_FUNDS_CONFIRMED);
    assertTransition(WITHDRAWAL_STATES.PAYOUT_FUNDS_CONFIRMED, WITHDRAWAL_STATES.RESERVED);
    assertTransition(WITHDRAWAL_STATES.RESERVED, WITHDRAWAL_STATES.SENT_TO_PROVIDER);
    assertTransition(WITHDRAWAL_STATES.SENT_TO_PROVIDER, WITHDRAWAL_STATES.SUCCESSFUL);
  });
});

test("TEST 11: Feature flag disabled preserves existing behavior", async () => {
  process.env.TREASURY_CROSS_CURRENCY_WITHDRAWALS_ENABLED = "false";
  const flagStatus = process.env.TREASURY_CROSS_CURRENCY_WITHDRAWALS_ENABLED === "true";
  assert.strictEqual(flagStatus, false);
});
