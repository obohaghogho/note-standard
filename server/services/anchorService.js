const axios = require("axios");
const supabase = require("../config/database");
const logger = require("../utils/logger");

/**
 * PLATFORM_SETTLEMENT_NUBANS
 * These are the Anchor merchant settlement account numbers that belong to the platform itself.
 * They must NEVER be stored as a user's personal dedicated virtual account — doing so causes all
 * inbound deposits to be mis-attributed. Any Virtual NUBAN resolved from the Anchor API that
 * matches these numbers or platform names must be skipped; a fresh individual NUBAN must be provisioned.
 */
const PLATFORM_SETTLEMENT_NUBANS = [
  '6179630721',
  '6175916799',
  '6177724635',
  '6172662064',
  '6171397167',
  '6170660293',
  '6172312778',
];
const PLATFORM_MERCHANT_CUSTOMER_ID = '1784719040852722-anc_bus_cst';

function isPlatformSettlementAccount(acctNo, acctName) {
  if (!acctNo) return false;
  const trimmedNo = String(acctNo).trim();
  const trimmedName = acctName ? String(acctName).trim().toUpperCase() : '';
  return PLATFORM_SETTLEMENT_NUBANS.includes(trimmedNo) || trimmedName.includes('JOSSY DIGITAL');
}

/**
 * Anchor BaaS Service Layer
 * Wraps REST calls to Anchor API platform and manages database records for Anchor virtual accounts
 */
class AnchorService {
  constructor() {
    this.env = (process.env.ANCHOR_ENV || "sandbox").toLowerCase();
    const defaultUrl = this.env === "production"
      ? "https://api.getanchor.co/api/v1"
      : "https://api.sandbox.getanchor.co/api/v1";
    
    this.baseUrl = process.env.ANCHOR_BASE_URL || defaultUrl;
    this.secretKey = process.env.ANCHOR_SECRET_KEY || "";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "x-anchor-key": this.secretKey,
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
    this.pendingProvisioningPromises = new Map();
  }

  isEnabled() {
    return process.env.ANCHOR_ENABLED === "true" && Boolean(this.secretKey);
  }

  assertEnabled() {
    if (!this.isEnabled()) {
      throw new Error("Anchor BaaS service is currently disabled or missing configuration.");
    }
  }

  /**
   * Resolve or onboard customer record on Anchor BaaS
   */
  async getOrCreateAnchorCustomer(userId, email, firstName, lastName, phone, bvn = null) {
    this.assertEnabled();
    if (!userId) throw new Error("userId is required for Anchor customer resolution");

    try {
      // 1. Check existing record in public.anchor_customers
      const { data: existingCustomer } = await supabase
        .from("anchor_customers")
        .select("*")
        .eq("user_id", userId)
        .eq("customer_type", "individual")
        .maybeSingle();

      if (existingCustomer && existingCustomer.anchor_customer_id && existingCustomer.anchor_customer_id !== PLATFORM_MERCHANT_CUSTOMER_ID) {
        return existingCustomer;
      }

      // 2. Onboard new customer on Anchor API
      logger.info(`[AnchorService] Onboarding new individual customer on Anchor for user ${userId}`);

      // Anchor requires a non-null valid phone number string
      let sanitizedPhone = "08000000000";
      if (phone && typeof phone === "string" && phone.trim().length >= 8) {
        sanitizedPhone = phone.replace(/^\+/, "").trim();
      }

      const payload = {
        data: {
          type: "IndividualCustomer",
          attributes: {
            email: email,
            fullName: {
              firstName: firstName || "Customer",
              lastName: lastName || "User",
            },
            phoneNumber: sanitizedPhone,
            kyc: bvn ? { bvn } : undefined,
          },
        },
      };

      const response = await this.client.post("/customers", payload);
      const anchorCust = response.data?.data || response.data || {};
      const anchorCustomerId = anchorCust.id || anchorCust.customer_id;

      if (!anchorCustomerId || anchorCustomerId === PLATFORM_MERCHANT_CUSTOMER_ID) {
        throw new Error("Anchor API did not return a valid individual customer ID");
      }

      // 3. Store mapping in public.anchor_customers table
      const { data: insertedCustomer, error: insertError } = await supabase
        .from("anchor_customers")
        .insert({
          user_id: userId,
          anchor_customer_id: anchorCustomerId,
          customer_type: "individual",
          status: anchorCust.attributes?.status || "ACTIVE",
          metadata: anchorCust,
        })
        .select("*")
        .single();

      if (insertError) {
        logger.warn(`[AnchorService] Warning storing anchor_customers record: ${insertError.message}`);
        return {
          user_id: userId,
          anchor_customer_id: anchorCustomerId,
          customer_type: "individual",
          status: "ACTIVE",
        };
      }

      return insertedCustomer;
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.response?.data?.errors?.[0]?.title || error.response?.data?.message || error.message;
      
      // Fallback: If customer already exists on Anchor, resolve existing customer record
      if (errMsg && /already exist/i.test(errMsg)) {
        logger.info(`[AnchorService] Customer already exists on Anchor. Searching existing customer list for email ${email}...`);
        try {
          const listRes = await this.client.get("/customers");
          const customers = listRes.data?.data || [];
          const matched = customers.find((c) => {
            const attr = c.attributes || c;
            const isInd = c.type === 'IndividualCustomer' || attr.type === 'IndividualCustomer' || c.id?.includes('anc_ind_cst');
            return isInd && (
              (attr.email && attr.email.toLowerCase() === email.toLowerCase()) ||
              (phone && attr.phoneNumber && attr.phoneNumber === phone.replace(/^\+/, ""))
            );
          });

          if (matched && matched.id && matched.id !== PLATFORM_MERCHANT_CUSTOMER_ID) {
            const anchorCustomerId = matched.id;
            logger.info(`[AnchorService] Resolved existing Anchor customer ID ${anchorCustomerId}`);
            
            await supabase.from("anchor_customers").upsert(
              {
                user_id: userId,
                anchor_customer_id: anchorCustomerId,
                customer_type: "individual",
                status: matched.attributes?.status || "ACTIVE",
                metadata: matched,
              },
              { onConflict: "user_id,customer_type" }
            );

            return {
              user_id: userId,
              anchor_customer_id: anchorCustomerId,
              customer_type: "individual",
              status: "ACTIVE",
            };
          }
        } catch (fallbackErr) {
          logger.warn(`[AnchorService] Existing customer resolution failed: ${fallbackErr.message}`);
        }
      }

      logger.error(`[AnchorService] Customer Onboarding Failure: ${errMsg}`);
      throw new Error(errMsg || "Failed to onboard Anchor customer");
    }
  }

  /**
   * Provision a Dedicated NGN Virtual Account (DVA) on Anchor
   */
  async createVirtualAccount(data) {
    this.assertEnabled();
    const { userId, email, firstName, lastName, phone, bvn } = data;

    if (!userId || !email) {
      throw new Error("userId and email are strictly required to create a virtual account");
    }

    // Concurrency protection: handle simultaneous calls for the same userId safely
    if (!this.pendingProvisioningPromises) {
      this.pendingProvisioningPromises = new Map();
    }
    if (this.pendingProvisioningPromises.has(userId)) {
      logger.info(`[AnchorService] Concurrency protection active: waiting for existing provisioning request for user ${userId}`);
      return await this.pendingProvisioningPromises.get(userId);
    }

    const provisionTask = (async () => {
      // 0. Check if user already has a valid Anchor dedicated_account (Idempotency)
      const { data: existingDva } = await supabase
        .from("dedicated_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("provider", "anchor")
        .eq("currency", "NGN")
        .maybeSingle();

      const isStaleProvidus = existingDva?.bank_name?.toUpperCase().includes("PROVIDUS");
      const hasValidNuban = existingDva?.account_number && /^\d{10}$/.test(existingDva.account_number);
      const hasValidBankName = existingDva?.bank_name && 
        !existingDva.bank_name.toUpperCase().includes("PROVIDUS") &&
        existingDva.bank_name !== "0000000000";
      const isPlatformAccount = isPlatformSettlementAccount(existingDva?.account_number, existingDva?.account_name);
      const isMerchantCustomerCode = existingDva?.provider_customer_code === PLATFORM_MERCHANT_CUSTOMER_ID;
      const isInvalidAccountRecord = isStaleProvidus || !hasValidNuban || !hasValidBankName || isPlatformAccount || isMerchantCustomerCode;

      if (existingDva && existingDva.account_number && !isInvalidAccountRecord) {
        logger.info(`[AnchorService] Found existing valid dedicated_account for user ${userId}: ${existingDva.account_number} (${existingDva.bank_name})`);
        const userRefService = require('./payment/UserBankReferenceService');
        let userRef = null;
        try {
          userRef = await userRefService.getOrCreateUserReference(userId, 'anchor');
        } catch (e) {}

        return {
          id: existingDva.id,
          bankName: existingDva.bank_name,
          bank_name: existingDva.bank_name,
          accountNumber: existingDva.account_number,
          account_number: existingDva.account_number,
          accountName: existingDva.account_name,
          account_name: existingDva.account_name,
          currency: existingDva.currency,
          provider: existingDva.provider,
          customerCode: existingDva.provider_customer_code,
          userReference: userRef || `NS-${userId.substring(0, 6).toUpperCase()}`,
          user_reference: userRef || `NS-${userId.substring(0, 6).toUpperCase()}`,
        };
      }

      if (isInvalidAccountRecord && existingDva) {
        logger.warn(`[AnchorService] User ${userId} has legacy/platform account stored (${existingDva.account_number}). Bypassing record and resolving clean customer-linked account (Preserving DB record for audit)...`);
      }

      // 1. Ensure user has an Anchor Customer record (IndividualCustomer)
      let customer;
      try {
        customer = await this.getOrCreateAnchorCustomer(userId, email, firstName, lastName, phone, bvn);
      } catch (custErr) {
        const statusCode = custErr.response?.status;
        if (statusCode === 502 || statusCode === 503 || statusCode === 504 || custErr.code === 'ECONNREFUSED' || custErr.code === 'ETIMEDOUT') {
          const err = new Error('ANCHOR_API_UNAVAILABLE: Anchor banking service is temporarily unavailable. Please use Fincra GTBank transfer instead.');
          err.code = 'ANCHOR_API_UNAVAILABLE';
          throw err;
        }
        throw custErr;
      }

      if (!customer || !customer.anchor_customer_id || customer.anchor_customer_id === PLATFORM_MERCHANT_CUSTOMER_ID) {
        const err = new Error('ANCHOR_INVALID_CUSTOMER: Unable to resolve valid individual Anchor customer for user.');
        err.code = 'ANCHOR_INVALID_CUSTOMER';
        throw err;
      }

      // 2. Resolve Anchor Settlement Deposit Account
      logger.info(`[AnchorService] Resolving settlement deposit account for customer ${customer.anchor_customer_id}`);
      let settlementAcc = null;
      try {
        const accRes = await this.client.get("/accounts");
        const accounts = accRes.data?.data || [];
        settlementAcc = accounts.find((a) => a.attributes?.type === "FBO" || a.attributes?.type === "SETTLEMENT") || accounts[0];
      } catch (accErr) {
        const statusCode = accErr.response?.status;
        if (statusCode === 502 || statusCode === 503 || statusCode === 504 || accErr.code === 'ECONNREFUSED' || accErr.code === 'ETIMEDOUT') {
          const err = new Error('ANCHOR_API_UNAVAILABLE: Anchor banking service is temporarily unavailable. Please use Fincra GTBank transfer instead.');
          err.code = 'ANCHOR_API_UNAVAILABLE';
          throw err;
        }
        throw accErr;
      }

      if (!settlementAcc) {
        throw new Error("No Anchor settlement deposit account available");
      }

      // 3. Request Customer-linked Virtual NUBAN from Anchor API
      logger.info(`[AnchorService] Provisioning customer-linked Virtual NUBAN for customer ${customer.anchor_customer_id}`);
      const payload = {
        data: {
          type: "VirtualNuban",
          attributes: {
            name: `${firstName || ''} ${lastName || ''}`.trim() || email,
          },
          relationships: {
            customer: {
              data: {
                type: "IndividualCustomer",
                id: customer.anchor_customer_id,
              },
            },
            settlementAccount: {
              data: {
                type: "DepositAccount",
                id: settlementAcc.id,
              },
            },
          },
        },
      };

      let response;
      try {
        response = await this.client.post("/virtual-nubans", payload);
      } catch (apiErr) {
        const statusCode = apiErr.response?.status;
        if (statusCode === 502 || statusCode === 503 || statusCode === 504 || apiErr.code === 'ECONNREFUSED' || apiErr.code === 'ETIMEDOUT') {
          // Timeout ambiguity check (Section 11): Check if account was actually created on DB/Anchor before failing
          const { data: timeoutCheck } = await supabase
            .from("dedicated_accounts")
            .select("*")
            .eq("user_id", userId)
            .eq("provider", "anchor")
            .eq("currency", "NGN")
            .maybeSingle();

          if (timeoutCheck && timeoutCheck.account_number && !isPlatformSettlementAccount(timeoutCheck.account_number, timeoutCheck.account_name)) {
            logger.info(`[AnchorService] Timeout occurred but valid account ${timeoutCheck.account_number} was already persisted.`);
            return timeoutCheck;
          }

          const err = new Error('ANCHOR_API_UNAVAILABLE: Anchor banking service is temporarily unavailable. Please use Fincra GTBank transfer instead.');
          err.code = 'ANCHOR_API_UNAVAILABLE';
          throw err;
        }
        throw apiErr;
      }

      const entry = response.data?.data || response.data || {};
      const attr = entry.attributes || entry;
      const accountNo = attr.accountNumber;
      const accountName = attr.accountName || `${firstName || ''} ${lastName || ''}`.trim();
      const bankName = attr.bank?.name || "9 Payment Service Bank";
      const returnedCustId = entry.relationships?.customer?.data?.id || attr.customerId || customer.anchor_customer_id;

      // ── HARD DEFENSIVE VALIDATION GUARD (Sections 5 & 6) ───────────────────
      if (isPlatformSettlementAccount(accountNo, accountName)) {
        logger.error(`[AnchorService] DEFENSIVE GUARD: Anchor returned merchant/platform NUBAN (${accountNo}) for user ${userId}. REJECTING.`);
        const err = new Error('ANCHOR_NO_VALID_ACCOUNT: Provisioned account rejected by defensive merchant NUBAN guard.');
        err.code = 'ANCHOR_NO_VALID_ACCOUNT';
        throw err;
      }

      if (returnedCustId === PLATFORM_MERCHANT_CUSTOMER_ID) {
        logger.error(`[AnchorService] DEFENSIVE GUARD: Account linked to platform BusinessCustomer (${returnedCustId}) instead of user IndividualCustomer. REJECTING.`);
        const err = new Error('ANCHOR_NO_VALID_ACCOUNT: Account rejected by customer linkage guard.');
        err.code = 'ANCHOR_NO_VALID_ACCOUNT';
        throw err;
      }

      if (!accountNo || !/^\d{10}$/.test(accountNo)) {
        logger.error(`[AnchorService] DEFENSIVE GUARD: Account number is invalid or not 10 digits: ${accountNo}`);
        const err = new Error('ANCHOR_NO_VALID_ACCOUNT: Anchor API response did not contain a valid 10-digit NUBAN.');
        err.code = 'ANCHOR_NO_VALID_ACCOUNT';
        throw err;
      }

      // 4. Save virtual account in public.dedicated_accounts table
      const { data: dvaRecord, error: dvaError } = await supabase
        .from("dedicated_accounts")
        .upsert(
          {
            user_id: userId,
            provider: "anchor",
            provider_customer_code: customer.anchor_customer_id,
            provider_account_id: entry.id || accountNo,
            bank_name: bankName,
            account_number: accountNo,
            account_name: accountName,
            currency: "NGN",
            status: "ACTIVE",
            metadata: entry,
          },
          { onConflict: "user_id,provider,currency" }
        )
        .select("*")
        .maybeSingle();

      if (dvaError) {
        logger.error(`[AnchorService] Failed saving dedicated_account record: ${dvaError.message}`);
      }

      logger.info(`[AnchorService] Customer-linked Virtual NUBAN ${accountNo} provisioned and saved for user ${userId}`);
      return {
        id: dvaRecord?.id || entry.id,
        bankName,
        accountNumber: accountNo,
        accountName,
        currency: "NGN",
        provider: "anchor",
        customerCode: customer.anchor_customer_id,
        providerCustomerCode: customer.anchor_customer_id,
        providerAccountId: entry.id || accountNo,
        status: "ACTIVE",
        metadata: entry,
      };
    })();

    this.pendingProvisioningPromises.set(userId, provisionTask);
    try {
      return await provisionTask;
    } finally {
      this.pendingProvisioningPromises.delete(userId);
    }
  }

  /**
   * Account Name Lookup / Resolution via Anchor NIP
   */
  async resolveAccountName(accountNumber, bankCode) {
    this.assertEnabled();
    if (!accountNumber || !bankCode) {
      throw new Error("accountNumber and bankCode are required for account name resolution");
    }

    try {
      const response = await this.client.get("/transfers/verify-account", {
        params: { accountNumber, bankCode },
      });

      const resData = response.data?.data || response.data || {};
      return {
        accountName: resData.accountName || resData.account_name,
        accountNumber: resData.accountNumber || accountNumber,
        bankCode: resData.bankCode || bankCode,
      };
    } catch (error) {
      logger.error(`[AnchorService] Account Resolution Error: ${error.response?.data?.message || error.message}`);
      throw new Error(error.response?.data?.message || "Failed to resolve bank account name");
    }
  }

  /**
   * Retrieve List of Supported Banks from Anchor API
   */
  async getBankList() {
    this.assertEnabled();
    try {
      const response = await this.client.get("/banks");
      const list = response.data?.data || response.data || [];
      return list.map((b) => {
        const attr = b.attributes || b;
        return {
          name: attr.name || b.name,
          code: attr.nipCode || attr.code || b.code || b.nipCode,
          slug: (attr.slug || attr.name || b.name || "").toLowerCase().replace(/\s+/g, "-"),
        };
      });
    } catch (error) {
      logger.error(`[AnchorService] Bank List Retrieval Error: ${error.message}`);
      return [];
    }
  }

  /**
   * Initiate Outbound NIP Transfer via Anchor API
   */
  async initiateTransfer(data) {
    this.assertEnabled();
    const { amount, currency = "NGN", destination, reason = "Wallet withdrawal" } = data;

    if (!amount || amount <= 0) throw new Error("Valid transfer amount is required");
    if (!destination || !destination.accountNumber || !destination.bankCode) {
      throw new Error("Destination accountNumber and bankCode are required");
    }

    const { normalizeToSmallestUnit } = require("../config/currencyMetadata");
    const amountInUnits = normalizeToSmallestUnit(amount, currency);

    try {
      const response = await this.client.post("/transfers", {
        amount: amountInUnits,
        currency: currency.toUpperCase(),
        reason,
        counterParty: {
          accountNumber: destination.accountNumber,
          bankCode: destination.bankCode,
          accountName: destination.accountName || undefined,
        },
      });

      const resData = response.data?.data || response.data || {};
      return {
        success: true,
        status: (resData.status || "pending").toLowerCase(),
        reference: resData.id || resData.reference || `tr_anchor_${Date.now()}`,
        raw: resData,
      };
    } catch (error) {
      logger.error(`[AnchorService] Transfer Error: ${error.response?.data?.message || error.message}`);
      throw new Error(error.response?.data?.message || "Anchor transfer initiation failed");
    }
  }

  /**
   * Auto-Sync Pending Deposits from Anchor Core Banking API
   * Fetches latest Inbound NIP transactions for user's dedicated accounts and auto-credits any uncredited deposit.
   */
  async syncPendingAnchorDeposits(userId) {
    if (!this.isEnabled()) return [];
    try {
      let query = supabase.from("dedicated_accounts").select("*").eq("provider", "anchor");
      if (userId) {
        query = query.eq("user_id", userId);
      } else {
        // Batch sync: skip test/seed accounts to avoid crediting fake wallets
        // with real platform deposits. Test emails end with .test or @notestandard.test.
        const { data: testIds } = await supabase
          .from("profiles")
          .select("id")
          .or("email.ilike.%@notestandard.test,email.ilike.%.test,email.ilike.loadtest%");
        if (testIds && testIds.length > 0) {
          query = query.not("user_id", "in", `(${testIds.map(t => t.id).join(",")})`);
        }
      }

      const { data: dedicatedAccs, error: dvaErr } = await query;
      if (dvaErr || !dedicatedAccs || dedicatedAccs.length === 0) return [];

      const DepositCreditEngine = require("./payment/DepositCreditEngine");
      const creditedTransactions = [];

      for (const dva of dedicatedAccs) {
        let accountId = dva.provider_account_id || dva.account_number;
        // Anchor API requires deposit account ID (ends with -anc_acc), not Virtual NUBAN ID (ends with -anc_acc_num)
        if (accountId && accountId.endsWith("-anc_acc_num")) {
          const metaSettlementId = dva.metadata?.relationships?.settlementAccount?.data?.id;
          if (metaSettlementId && metaSettlementId.endsWith("-anc_acc")) {
            accountId = metaSettlementId;
            logger.info(`[AnchorSync] Resolved settlement account ID ${accountId} from dva.metadata for user ${dva.user_id}`);
          } else {
            try {
              const vnRes = await this.client.get(`/virtual-nubans/${accountId}`);
              const vnData = vnRes.data?.data || vnRes.data;
              const vnSettlementId = vnData?.relationships?.settlementAccount?.data?.id;
              if (vnSettlementId && vnSettlementId.endsWith("-anc_acc")) {
                accountId = vnSettlementId;
                logger.info(`[AnchorSync] Resolved settlement account ID ${accountId} from Anchor VN API for user ${dva.user_id}`);
              } else {
                const accRes = await this.client.get("/accounts");
                const accList = accRes.data?.data || [];
                const last4 = (dva.account_number || "").slice(-4);
                const matchingAcc = accList.find((a) =>
                  (a.attributes?.accountNumber || a.accountNumber || "").endsWith(last4)
                );
                if (matchingAcc) {
                  accountId = matchingAcc.id;
                  logger.info(`[AnchorSync] Resolved placeholder account ${dva.account_number} -> real Anchor ID ${accountId} for user ${dva.user_id}`);
                } else if (accList && accList.length > 0) {
                  accountId = accList[0].id;
                  logger.info(`[AnchorSync] Resolved Anchor FBO deposit account ${accountId} for user ${dva.user_id}`);
                } else {
                  logger.warn(`[AnchorSync] No real Anchor account found matching last-4 '${last4}' for user ${dva.user_id}. Skipping sync for this dedicated_account.`);
                  continue;
                }
              }
            } catch (e) {
              logger.warn(`[AnchorSync] Could not resolve deposit account ID for ${dva.account_number}: ${e.message}`);
              continue;
            }
          }
        }

        if (!accountId) continue;

        try {
          const res = await this.client.get("/transactions", { params: { accountId: accountId } });
          const txs = res.data?.data || [];

          for (const tx of txs) {
            const attr = tx.attributes || tx;
            const type = (tx.type || "").toLowerCase();
            if (!type.includes("inbound") && !type.includes("deposit") && !type.includes("credit")) continue;

            const txId = tx.id;
            const rawAmount = parseFloat(attr.amount || 0);
            if (rawAmount <= 0) continue;

            // Convert kobo to Naira
            const amountInNaira = rawAmount / 100;
            const depRef = txId;

            // Check if already in DB
            const { data: existingTx } = await supabase
              .from("transactions")
              .select("id, status, wallet_credit_status")
              .or(`provider_reference.eq.${depRef},reference_id.eq.${depRef},reference_id.eq.ANCHOR-DEP-${depRef}`)
              .maybeSingle();

            if (!existingTx) {
              logger.info(`[AnchorSync] Uncredited deposit detected on Anchor API (${txId}: ${amountInNaira} NGN). Auto-crediting user ${dva.user_id}...`);
              
              const walletService = require("./walletService");
              const wallet = await walletService.createWallet(dva.user_id, "NGN", "native");

              if (wallet && wallet.id) {
                const { data: newTx, error: newTxErr } = await supabase
                  .from("transactions")
                  .insert({
                    user_id: dva.user_id,
                    wallet_id: wallet.id,
                    amount: amountInNaira,
                    currency: "NGN",
                    type: "DEPOSIT",
                    status: "PENDING",
                    reference_id: `ANCHOR-DEP-${depRef}`,
                    provider_reference: depRef,
                    provider: "anchor",
                    payment_status: "PAYMENT_CONFIRMED",
                    wallet_credit_status: "WALLET_CREDIT_PENDING",
                    display_label: `Anchor Virtual Account Deposit (${amountInNaira} NGN)`,
                    metadata: {
                      anchor_transaction_id: depRef,
                      summary: attr.summary,
                      auto_synced: true
                    }
                  })
                  .select("*")
                  .single();

                if (!newTxErr && newTx) {
                  const creditRes = await DepositCreditEngine.credit({
                    transactionId: newTx.id,
                    reference: depRef,
                    amount: amountInNaira,
                    currency: "NGN",
                    userId: dva.user_id,
                    source: "ANCHOR_AUTO_SYNC"
                  });

                  if (creditRes && creditRes.credited) {
                    creditedTransactions.push(newTx.id);
                  }
                }
              }
            }
          }
        } catch (txErr) {
          logger.warn(`[AnchorSync] Error querying transactions for account ${accountId}: ${txErr.message}`);
        }
      }

      return creditedTransactions;
    } catch (err) {
      logger.error(`[AnchorSync] Global sync error: ${err.message}`);
      return [];
    }
  }

  /**
   * Provider Health Monitoring Diagnostics
   */
  async getHealthStatus() {
    if (!this.isEnabled()) {
      return {
        enabled: false,
        status: "disabled",
        mode: this.env,
        latencyMs: 0,
      };
    }

    try {
      const start = Date.now();
      await this.client.get("/banks");
      return {
        enabled: true,
        status: "healthy",
        mode: this.env,
        latencyMs: Date.now() - start,
        authenticated: true,
      };
    } catch (error) {
      return {
        enabled: true,
        status: "unhealthy",
        mode: this.env,
        latencyMs: 999,
        error: error.message,
      };
    }
  }
}

module.exports = new AnchorService();
