/**
 * VirtualAccountService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Provider-agnostic virtual account management service. Handles account
 * query, provisioning status, KYC validation, status refresh, and archiving.
 */

'use strict';

const supabase = require("../config/database");
const ProviderRouter = require("./ProviderRouter");
const PaymentFactory = require("./payment/PaymentFactory");
const logger = require("../utils/logger");
const realtime = require("./realtimeService");

class VirtualAccountService {
  /**
   * Get all virtual accounts for a user
   * @param {string} userId
   */
  async getVirtualAccounts(userId) {
    const { data, error } = await supabase
      .from("dedicated_accounts")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      logger.error(`[VirtualAccountService] Failed to fetch accounts: ${error.message}`);
      throw error;
    }
    return data || [];
  }

  /**
   * Get primary virtual account for a specific currency
   * @param {string} userId
   * @param {string} currency
   */
  async getVirtualAccount(userId, currency) {
    const upperCurrency = (currency || "").toUpperCase();
    const { data, error } = await supabase
      .from("dedicated_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("currency", upperCurrency)
      .maybeSingle();

    if (error) {
      logger.error(`[VirtualAccountService] Failed to fetch account for ${upperCurrency}: ${error.message}`);
      throw error;
    }
    return data || null;
  }

  /**
   * Provision a virtual account for a user and currency
   * @param {string} userId
   * @param {string} currency
   * @param {Object} kycData - Optional manual overrides for KYC inputs
   */
  async createVirtualAccount(userId, currency, kycData = {}) {
    const upperCurrency = (currency || "").toUpperCase();
    logger.info(`[VirtualAccountService] Provisioning request for ${upperCurrency} (User: ${userId})`);

    // 1. Double check if one already exists
    const existing = await this.getVirtualAccount(userId, upperCurrency);
    if (existing) {
      logger.info(`[VirtualAccountService] Dedicated account already exists for ${upperCurrency} (User: ${userId})`);
      return existing;
    }

    // 2. Resolve Provider & check if available
    const providerName = ProviderRouter.getProvider(upperCurrency, 'virtual_account');
    if (providerName === 'coming_soon') {
      throw new Error(`COMING_SOON: Virtual account support for ${upperCurrency} is not active yet.`);
    }
    if (providerName === 'unsupported') {
      throw new Error(`UNSUPPORTED: Virtual accounts are not supported for currency ${upperCurrency}.`);
    }

    // 3. Fetch User Profile
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      throw new Error(`PROFILE_NOT_FOUND: User profile not found: ${profileErr?.message || "unknown"}`);
    }

    // 4. Validate Currency-Specific KYC Requirements
    const isFcy = ["USD", "EUR", "GBP", "CAD", "AUD"].includes(upperCurrency);
    const firstName = kycData.firstName || profile.first_name || profile.full_name?.split(" ")[0] || "Standard";
    const lastName = kycData.lastName || profile.last_name || profile.full_name?.split(" ")[1] || "User";
    const email = profile.email;
    const phone = kycData.phone || profile.phone || "";

    if (!email) {
      throw new Error("KYC_ERROR: Email address is strictly required.");
    }

    let providerKyc = {
      currency: upperCurrency,
      email,
      firstName,
      lastName,
      phone,
    };

    if (isFcy) {
      // International KYC: requires documents (ID Card + Utility Bill)
      const idCard = kycData.documentUrls?.idCard || profile.id_card_url || profile.metadata?.document_urls?.id_card;
      const utilityBill = kycData.documentUrls?.utilityBill || profile.utility_bill_url || profile.metadata?.document_urls?.utility_bill;
      
      if (!idCard || !utilityBill) {
        const err = new Error(`MISSING_KYC_DOCUMENTS: Generating a virtual ${upperCurrency} account requires uploading ID Card and Utility Bill verification documents.`);
        err.code = "MISSING_KYC_DOCUMENTS";
        throw err;
      }

      Object.assign(providerKyc, {
        dob: kycData.dob || profile.metadata?.dob || "1990-01-01",
        occupation: kycData.occupation || profile.metadata?.occupation || "Professional",
        address: kycData.address || profile.metadata?.address || {
          street: "1 Main St",
          city: "Lagos",
          state: "Lagos State",
          country: "NG",
          postalCode: "100001",
        },
        documentUrls: {
          idCard,
          utilityBill,
        },
      });
    }

    // 5. Call Provider to Create Account
    logger.info(`[VirtualAccountService] Invoking provider [${providerName}] for ${upperCurrency}`);
    const provider = PaymentFactory.getProviderByName(providerName);
    
    let providerResult;
    try {
      providerResult = await provider.createVirtualAccount(providerKyc);
    } catch (provErr) {
      logger.error(`[VirtualAccountService] Provider account creation rejected: ${provErr.message}`);
      throw provErr;
    }

    // 6. Save Provisioned Details in Database
    const metadata = {
      ...(providerResult.metadata || {}),
      raw_response: providerResult.rawResponse || providerResult,
    };

    const { data: dedicatedAccount, error: saveErr } = await supabase
      .from("dedicated_accounts")
      .insert({
        user_id: userId,
        provider: providerName,
        provider_customer_code: providerResult.providerCustomerCode || null,
        provider_account_id: providerResult.providerAccountId || null,
        bank_name: providerResult.bankName,
        account_number: providerResult.accountNumber,
        account_name: providerResult.accountName,
        currency: upperCurrency,
        status: 'ACTIVE',
        metadata,
      })
      .select()
      .single();

    if (saveErr) {
      logger.error(`[VirtualAccountService] Failed to save virtual account details: ${saveErr.message}`);
      throw saveErr;
    }

    // 7. Emit events & send push notifications
    try {
      const { createNotification } = require("./notificationService");
      await createNotification({
        receiverId: userId,
        type: "virtual_account_created",
        title: `Virtual Account Ready`,
        message: `Your dedicated ${upperCurrency} virtual account with ${providerResult.bankName} is now active.`,
        link: `/dashboard/wallet`,
      });

      await realtime.emitToUser(userId, "virtual_account_updated", {
        userId,
        currency: upperCurrency,
        status: "ACTIVE",
        bankName: providerResult.bankName,
        accountNumber: providerResult.accountNumber,
      });
    } catch (sideErr) {
      logger.warn(`[VirtualAccountService] Notification chain warning: ${sideErr.message}`);
    }

    logger.info(`[VirtualAccountService] Dedicated account created successfully: ${providerResult.accountNumber}`);
    return dedicatedAccount;
  }

  /**
   * Refresh virtual account status from provider (manual action or webhook callback)
   * @param {string} userId
   * @param {string} currency
   */
  async refreshAccountStatus(userId, currency) {
    const upperCurrency = (currency || "").toUpperCase();
    const account = await this.getVirtualAccount(userId, upperCurrency);
    if (!account) {
      throw new Error(`Account not found for currency ${upperCurrency}`);
    }

    const provider = PaymentFactory.getProviderByName(account.provider);
    if (typeof provider.refreshVirtualAccountStatus === 'function') {
      const freshDetails = await provider.refreshVirtualAccountStatus(account.provider_account_id);
      
      const { data: updated, error } = await supabase
        .from("dedicated_accounts")
        .update({
          status: freshDetails.status || account.status,
          metadata: { ...account.metadata, raw_response: freshDetails },
          updated_at: new Date(),
        })
        .eq("id", account.id)
        .select()
        .single();
        
      if (error) throw error;
      return updated;
    }

    return account;
  }

  /**
   * Close or Archive a virtual account
   * @param {string} userId
   * @param {string} currency
   */
  async archiveAccount(userId, currency) {
    const upperCurrency = (currency || "").toUpperCase();
    const account = await this.getVirtualAccount(userId, upperCurrency);
    if (!account) return true;

    const { error } = await supabase
      .from("dedicated_accounts")
      .delete()
      .eq("id", account.id);

    if (error) {
      logger.error(`[VirtualAccountService] Archiving virtual account failed: ${error.message}`);
      throw error;
    }

    return true;
  }
}

module.exports = new VirtualAccountService();
