const axios = require("axios");
const supabase = require("../config/database");
const logger = require("../utils/logger");

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

      if (existingCustomer && existingCustomer.anchor_customer_id) {
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

      if (!anchorCustomerId) {
        throw new Error("Anchor API did not return a valid customer ID");
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
            return (
              (attr.email && attr.email.toLowerCase() === email.toLowerCase()) ||
              (phone && attr.phoneNumber && attr.phoneNumber === phone.replace(/^\+/, ""))
            );
          }) || customers[0];

          if (matched && matched.id) {
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

    try {
      // 0. Check if user already has an anchor dedicated_account (Idempotency)
      const { data: existingDva } = await supabase
        .from("dedicated_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("provider", "anchor")
        .eq("currency", "NGN")
        .maybeSingle();

      if (existingDva && existingDva.account_number) {
        logger.info(`[AnchorService] Found existing dedicated_account for user ${userId}: ${existingDva.account_number}`);
        return {
          id: existingDva.id,
          bankName: existingDva.bank_name,
          accountNumber: existingDva.account_number,
          accountName: existingDva.account_name,
          currency: existingDva.currency,
          provider: existingDva.provider,
          customerCode: existingDva.provider_customer_code,
        };
      }

      // 1. Ensure user has an Anchor Customer record
      let customer;
      try {
        customer = await this.getOrCreateAnchorCustomer(userId, email, firstName, lastName, phone, bvn);
      } catch (custErr) {
        logger.warn(`[AnchorService] Customer onboarding warning (${custErr.message}). Checking existing Virtual NUBANs...`);
      }

      // 1b. Check if Anchor already has provisioned Virtual NUBANs for the merchant
      try {
        const vnListRes = await this.client.get("/virtual-nubans");
        const list = vnListRes.data?.data || [];
        const activeVn = list.find((v) => (v.attributes?.status || v.status) === "ACTIVE") || list[0];
        
        if (activeVn) {
          const vAttr = activeVn.attributes || activeVn;
          const accountNo = vAttr.accountNumber;
          const accountName = vAttr.accountName || `${firstName || ''} ${lastName || ''}`.trim();
          const bankName = vAttr.bank?.name || "9 Payment Service Bank";

          if (accountNo) {
            logger.info(`[AnchorService] Resolved active Anchor Virtual NUBAN: ${accountNo} (${bankName})`);
            const { data: dvaRecord } = await supabase
              .from("dedicated_accounts")
              .upsert(
                {
                  user_id: userId,
                  provider: "anchor",
                  provider_customer_code: customer?.anchor_customer_id || "anchor_merchant_cust",
                  provider_account_id: activeVn.id || accountNo,
                  bank_name: bankName,
                  account_number: accountNo,
                  account_name: accountName,
                  currency: "NGN",
                  status: "ACTIVE",
                  metadata: activeVn,
                },
                { onConflict: "user_id,provider,currency" }
              )
              .select("*")
              .maybeSingle();

            return {
              id: dvaRecord?.id || activeVn.id,
              bankName,
              accountNumber: accountNo,
              accountName,
              currency: "NGN",
              provider: "anchor",
              customerCode: customer?.anchor_customer_id || "anchor_merchant_cust",
              providerCustomerCode: customer?.anchor_customer_id || "anchor_merchant_cust",
              providerAccountId: activeVn.id || accountNo,
              status: "ACTIVE",
              metadata: activeVn,
            };
          }
        }
      } catch (vnErr) {
        logger.warn(`[AnchorService] Virtual NUBAN list check warning: ${vnErr.message}`);
      }

      // 2. Resolve Anchor Settlement Account
      logger.info(`[AnchorService] Resolving settlement deposit account for customer ${customer?.anchor_customer_id}`);
      const accRes = await this.client.get("/accounts");
      const accounts = accRes.data?.data || [];
      const settlementAcc = accounts.find((a) => a.attributes?.type === "FBO" || a.attributes?.type === "SETTLEMENT") || accounts[0];

      if (!settlementAcc) {
        throw new Error("No Anchor settlement deposit account available");
      }

      // 3. Request Virtual NUBAN from Anchor API
      logger.info(`[AnchorService] Provisioning Virtual NUBAN on Anchor settlement account ${settlementAcc.id}`);
      const payload = {
        data: {
          type: "VirtualNuban",
          attributes: {
            name: `${firstName || ''} ${lastName || ''}`.trim() || email,
          },
          relationships: {
            settlementAccount: {
              data: {
                type: "DepositAccount",
                id: settlementAcc.id,
              },
            },
          },
        },
      };

      const response = await this.client.post("/virtual-nubans", payload);

      const entry = response.data?.data || response.data || {};
      const attr = entry.attributes || entry;
      const accountNo = attr.accountNumber;
      const accountName = attr.accountName || `${firstName || ''} ${lastName || ''}`.trim();
      const bankName = attr.bank?.name || "PROVIDUS BANK";

      if (!accountNo) {
        throw new Error("Anchor API response did not contain account_number");
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
            metadata: entry,
          },
          { onConflict: "user_id,provider,currency" }
        )
        .select("*")
        .single();

      if (dvaError) {
        logger.error(`[AnchorService] Failed saving dedicated_account record: ${dvaError.message}`);
      }

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
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.detail || error.response?.data?.message || error.message;
      logger.error(`[AnchorService] Create Virtual Account Error: ${errMsg}`);
      throw new Error(errMsg || "Failed to generate Anchor virtual account");
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
