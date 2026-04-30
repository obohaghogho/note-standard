const axios = require("axios");
const crypto = require("crypto");
const supabase = require("../../config/database"); // Added missing import
const logger = require("../../utils/logger");
const SystemState = require("../../config/SystemState");

const FINCRA_SECRET_KEY = process.env.FINCRA_SECRET_KEY;
const FINCRA_BUSINESS_ID = process.env.FINCRA_BUSINESS_ID;
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = process.env.NOWPAYMENTS_API_URL ||
  "https://api.nowpayments.io/v1";

// Default timeout for API calls (15 seconds)
const API_TIMEOUT = 15000;
const api = axios.create({
  timeout: API_TIMEOUT,
});

// Dynamically set Fincra base URL based on FINCRA_ENV env var
// NOTE: Do NOT use key length as a heuristic — key lengths vary between accounts.
const _fincraEnv = (process.env.FINCRA_ENV || 'sandbox').toLowerCase().trim();
const FINCRA_BASE_URL = (_fincraEnv === 'live' || _fincraEnv === 'production')
  ? 'https://api.fincra.com'
  : 'https://sandboxapi.fincra.com';

class PayoutService {
  /**
   * Initiate a fiat payout via Fincra Disbursement API
   * https://docs.fincra.com/docs/payouts
   */
  async createFincraTransfer(
    bankCode,
    accountNumber,
    amount,
    currency,
    reference,
    narration = "Withdrawal",
    options = {},
  ) {
    if (!FINCRA_SECRET_KEY || !FINCRA_BUSINESS_ID) {
      throw new Error("Fincra configuration missing (secret key or business ID)");
    }

    const startTime = Date.now();
    try {
      const accountName = options.accountName || "Account Holder";
      const country = options.country || (currency === "NGN" ? "NG" : "US");

      const requestPayload = {
          sourceCurrency: currency,
          destinationCurrency: currency,
          amount: parseFloat(amount),
          business: FINCRA_BUSINESS_ID,
          description: narration,
          customerReference: reference,
          beneficiary: {
            firstName: accountName.split(" ")[0] || "Account",
            lastName: accountName.split(" ").slice(1).join(" ") || "Holder",
            email: options.email || "user@notestandard.com",
            type: "individual",
            accountHolderName: accountName,
            accountNumber: accountNumber,
            bankCode: bankCode,
            country: country,
            sortCode: options.branchCode || options.swiftCode || undefined,
          },
          paymentDestination: "bank_account",
      };

      const response = await api.post(
        `${FINCRA_BASE_URL}/disbursements/payouts`,
        requestPayload,
        {
          headers: {
            "api-key": FINCRA_SECRET_KEY,
            "x-business-id": FINCRA_BUSINESS_ID,
            "Content-Type": "application/json",
          },
        },
      );

      const latency = Date.now() - startTime;
      const respData = response.data?.data || response.data || {};

      return {
        success: true,
        payoutId: respData.id || respData.reference || reference,
        status: respData.status || "PROCESSING",
        provider: "FINCRA",
        latency,
        rawResponse: response.data,
        requestPayload
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error(
        "[PayoutService] Fincra Transfer Error:",
        error.response?.data || error.message,
      );
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        latency,
        rawResponse: error.response?.data || { message: error.message }
      };
    }
  }

  /**
   * Internal helper to obtain a Bearer JWT for Payouts
   * Payouts require Bearer JWT (Auth handshake) whereas deposits use x-api-key
   */
  async getNowPaymentsAuthToken() {
    const email = process.env.NOWPAYMENTS_EMAIL;
    const password = process.env.NOWPAYMENTS_PASSWORD;

    if (!email || !password) {
      throw new Error("NOWPayments email/password missing in .env. Required for Payout JWT auth.");
    }

    try {
      // Check cache first (tokens usually last 5 mins)
      if (this._nowPaymentsToken && this._nowPaymentsTokenExpiry > Date.now()) {
        return this._nowPaymentsToken;
      }

      const response = await api.post(
        `${NOWPAYMENTS_API_URL}/auth`,
        { email, password },
        { headers: { "Content-Type": "application/json" } }
      );

      this._nowPaymentsToken = response.data.token;
      // Expire in 4.5 minutes to be safe
      this._nowPaymentsTokenExpiry = Date.now() + (4.5 * 60 * 1000);
      
      return this._nowPaymentsToken;
    } catch (error) {
      logger.error("[PayoutService] NOWPayments Auth Failed:", error.response?.data || error.message);
      throw new Error(`NowPayments authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Initiate a crypto payout via NOWPayments
   * https://documenter.getpostman.com/view/7907941/S1a32n38?version=latest#12d83296-6e5a-4cb7-9952-bf60a1e053a2
   */
  async createNowPaymentsPayout(
    address,
    amount,
    currency,
    reference,
    network = "native",
  ) {
    // --- MOCK MODE FOR TESTING ---
    if (process.env.MOCK_PAYOUT === 'true') {
      logger.info(`[PayoutService] MOCK MODE: Simulating NOWPayments Payout for ${amount} ${currency}`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network latency
      return {
        success: true,
        payoutId: `mock_tx_${Date.now()}`,
        status: 'FINISHED',
        provider: "MOCK",
        latency: 2000,
        rawResponse: { message: "Simulated success" },
        requestPayload: { address, amount, currency }
      };
    }
    // ----------------------------

    if (!NOWPAYMENTS_API_KEY) {
      throw new Error("NOWPayments configuration missing");
    }

    const startTime = Date.now();
    try {
      // Step 1: Obtain JWT Token (Mandatory for Payouts)
      const token = await this.getNowPaymentsAuthToken();

      // Step 2: Map currency tickers
      const payCurrencyMap = {
        "BTC_BITCOIN": "btc",
        "ETH_ETHEREUM": "eth",
        "USDT_TRC20": "usdttrc20",
        "USDT_ERC20": "usdterc20",
        "USDT_BEP20": "usdtbsc",
        "USDC_ERC20": "usdcerc20",
        "USDC_POLYGON": "usdcmatictoken",
      };

      const lookupKey = `${currency.toUpperCase()}_${(network || "native").toUpperCase()}`;
      const payCurrency = payCurrencyMap[lookupKey] || currency.toLowerCase();

      // Step 3: Request withdrawal
      const payload = {
        withdrawals: [
          {
            address: address,
            currency: payCurrency,
            amount: amount,
            ipn_callback_url: `${process.env.SERVER_URL || process.env.BACKEND_URL}/api/webhooks/nowpayments`,
          },
        ],
      };

      const response = await api.post(
        `${NOWPAYMENTS_API_URL}/payout`,
        payload,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
            "x-api-key": NOWPAYMENTS_API_KEY,
            "Content-Type": "application/json",
          },
        },
      );

      const latency = Date.now() - startTime;
      const withdrawal = response.data.withdrawals[0];

      return {
        success: true,
        payoutId: withdrawal.id,
        status: withdrawal.status,
        provider: "NOWPAYMENTS",
        latency,
        rawResponse: response.data,
        requestPayload: payload
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error(
        "[PayoutService] NOWPayments Payout Error:",
        error.response?.data || error.message,
      );
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        latency,
        rawResponse: error.response?.data || { message: error.message }
      };
    }
  }

  /**
   * Initiate a crypto-to-crypto conversion via NOWPayments
   * uses /v1/exchange or similar conversion-enabled payout flows
   */
  async createNowPaymentsConversion(
    fromCurrency,
    toCurrency,
    amount,
    reference,
    fromNetwork = "native",
    toNetwork = "native",
  ) {
    if (!NOWPAYMENTS_API_KEY) {
      throw new Error("NOWPayments configuration missing");
    }

    const payCurrencyMap = {
      "BTC_BITCOIN": "btc",
      "ETH_ETHEREUM": "eth",
      "USDT_TRC20": "usdttrc20",
      "USDT_ERC20": "usdterc20",
      "USDT_BEP20": "usdtbsc",
      "USDC_ERC20": "usdcerc20",
      "USDC_POLYGON": "usdcmatictoken",
    };

    const fromKey = `${fromCurrency.toUpperCase()}_${
      (fromNetwork || "native").toUpperCase()
    }`;
    const toKey = `${toCurrency.toUpperCase()}_${
      (toNetwork || "native").toUpperCase()
    }`;

    const fromTicker = payCurrencyMap[fromKey] || fromCurrency.toLowerCase();
    const toTicker = payCurrencyMap[toKey] || toCurrency.toLowerCase();

    try {
      // REQUIREMENT: Facilitate conversion via NOWPayments
      // In License-Light, we use the Exchange API to swap funds
      const response = await api.post(
        `${NOWPAYMENTS_API_URL}/exchange`,
        {
          from_currency: fromTicker,
          to_currency: toTicker,
          amount: amount,
          // Note: In some plans, conversion requires an address to send TO
          // For internal facilitation, we might send to a platform-managed interim address
          // or directly swap. Assuming exchange-to-payout flow.
          extra_id: reference,
        },
        {
          headers: {
            "x-api-key": NOWPAYMENTS_API_KEY,
            "Content-Type": "application/json",
          },
        },
      );

      return {
        success: true,
        conversionId: response.data.id || `conv_${Date.now()}`,
        status: response.data.status || "processing",
        provider: "NOWPAYMENTS",
      };
    } catch (error) {
      logger.error(
        "[PayoutService] NOWPayments Conversion Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        `NowPayments conversion failed: ${
          error.response?.data?.message || error.message
        }`,
      );
    }
  }

  /**
   * Initialize a managed payout request in the database
   */
  async createPayoutRequest(userId, walletId, data) {
    const { amount, currency, method, destination, ip, deviceId, client_idempotency_key } = data;
    
    // 1. Institutional Validation: Emergency Freeze Check
    if (!SystemState.isWithdrawalsEnabled()) {
        throw new Error("Withdrawals are currently suspended for system maintenance.");
    }

    // 2. Deterministic UUID Idempotency Check (Institutional Standard)
    if (!client_idempotency_key) {
        throw new Error("Missing client_idempotency_key. UUID required for financial finality.");
    }

    // -------------------------------------------------------------------------
    // DETERMINISTIC KERNEL: INTENT PUSH
    // -------------------------------------------------------------------------
    const causalGroupId = require('crypto').randomUUID();
    const shardId = parseInt(walletId.substring(0, 8), 16) % 4;

    const { data: intent, error: intentErr } = await supabase
      .from('causal_execution_queue')
      .insert({
        wallet_id: walletId,
        shard_id: shardId,
        idempotency_key: client_idempotency_key, // ENFORCED UUID
        intent_type: 'payout_create',
        expected_version: 1, 
        payload: {
          causal_group_id: causalGroupId,
          client_idempotency_key: client_idempotency_key,
          user_id: userId,
          amount: parseFloat(amount),
          currency,
          payout_method: method,
          destination: destination,
          ip_address: ip,
          device_fingerprint: deviceId
        }
      })
      .select()
      .single();

    if (intentErr) throw intentErr;
    return { ...intent, status: 'Processing' };
  }

  /**
   * Structure Enforced Payout State Updater
   */
  async updatePayoutState(requestId, status, auditData = {}) {
      const updateData = { 
          status: status,
          updated_at: new Date().toISOString()
      };
      
      // Map SLA & Audit metrics to columns
      if (auditData.latency) updateData.latency_ms = auditData.latency;
      if (auditData.rawResponse) updateData.last_provider_response = auditData.rawResponse;
      if (auditData.providerReference) updateData.provider_reference = auditData.providerReference;
      if (auditData.retry_count !== undefined) updateData.retry_count = auditData.retry_count;
      if (auditData.uncertain) updateData.processing_uncertain_at = new Date().toISOString();
      if (auditData.completed_at) updateData.completed_at = auditData.completed_at;

      // Handle structured failures
      if (status === 'FAILED' || status === 'FAILED_FINAL') {
          updateData.metadata = {
              ...(auditData.metadata || {}),
              failure_code: auditData.failure_code || "EXECUTION_ERROR",
              failure_reason: auditData.error || auditData.message || "Unknown failure",
              is_retryable: auditData.is_retryable || false
          };
      } else if (auditData.metadata) {
          updateData.metadata = auditData.metadata;
      }

      const { data, error } = await supabase
          .from('payout_requests')
          .update(updateData)
          .eq('id', requestId)
          .select()
          .single();
          
      if (error) {
          logger.error(`[PayoutService] Failed to update payout state for ${requestId}:`, error);
      }
      return data;
  }

  /**
   * Latency-Abstracted Status Exposure (3-Layer Model)
   */
  async getStatus(requestId) {
    const latencyMapper = require('./LatencyMapper');
    const { data: request, error } = await supabase
        .from('payout_requests')
        .select('*')
        .eq('id', requestId)
        .single();
    
    if (error || !request) return { status: 'Unknown' };

    // Map internal withdrawal_state and system latency (SLA) to user status
    const userStatus = latencyMapper.mapStatus(request.withdrawal_state, request.metadata?.sla_status || 'PENDING');
    const reason = latencyMapper.getReason(request.metadata?.sla_status || 'PENDING');

    return { 
        status: userStatus,
        explanation: reason,
        updatedAt: request.updated_at
    };
  }
}

module.exports = new PayoutService();
