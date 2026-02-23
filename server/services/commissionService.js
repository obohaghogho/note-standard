const supabase = require("../config/supabase");

const commissionService = {
  /**
   * Get admin setting value
   */
  async getSetting(key) {
    const { data, error } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", key)
      .single();
    if (error) return null;
    return data.value;
  },

  /**
   * Calculate commission for a given transaction amount and type.
   * @param {string} transactionType - 'TRANSFER_OUT', 'WITHDRAWAL', 'SWAP', 'FUNDING'
   * @param {number} amount - Amount to calculate fee on
   * @param {string} currency - Currency code
   * @param {string} userPlan - 'FREE', 'PRO', 'BUSINESS'
   * @returns {Promise<Object>} - { fee, rate, netAmount }
   */
  async calculateCommission(
    transactionType,
    amount,
    currency,
    userPlan = "FREE",
  ) {
    try {
      // Fetch applicable setting
      const { data: settings, error } = await supabase
        .from("commission_settings")
        .select("*")
        .eq("transaction_type", transactionType)
        .eq("is_active", true)
        .or(`currency.eq.${currency},currency.is.null`)
        .order("currency", { ascending: false })
        .limit(1);

      if (error) throw error;

      let fee = 0;
      let rate = 0;

      if (settings && settings.length > 0) {
        const setting = settings[0];
        rate = setting.value;

        // Requirement 3: PRO/BUSINESS features - reduced fees/spread
        // If the setting doesn't have plan-specific overrides, apply discounts
        if (userPlan === "PRO") rate = rate * 0.8; // 20% discount on fees
        if (userPlan === "BUSINESS") rate = rate * 0.5; // 50% discount on fees

        if (setting.commission_type === "PERCENTAGE") {
          fee = amount * rate;
        } else if (setting.commission_type === "FIXED") {
          fee = rate;
        }

        if (setting.min_fee && fee < setting.min_fee) fee = setting.min_fee;
        if (setting.max_fee && fee > setting.max_fee) fee = setting.max_fee;
      } else {
        // Fallback to admin_settings if commission_settings table is empty for this type
        if (transactionType === "FUNDING") {
          const fundingRate = await this.getSetting("funding_fee_percentage") ||
            7.0; // Default to 7%
          rate = fundingRate / 100;
          if (userPlan === "PRO") rate = rate * 0.8; // 20% discount for PRO
          if (userPlan === "BUSINESS") rate = rate * 0.5; // 50% discount for BUSINESS
          fee = amount * rate;
        } else if (transactionType === "WITHDRAWAL") {
          const withdrawFlat = await this.getSetting("withdrawal_fee_flat") ||
            0;
          const withdrawPerc =
            await this.getSetting("withdrawal_fee_percentage") || 7.0; // Default to 7%
          rate = withdrawPerc / 100;
          if (userPlan === "PRO") rate = rate * 0.8; // 20% discount for PRO
          if (userPlan === "BUSINESS") rate = rate * 0.5; // 50% discount for BUSINESS
          fee = withdrawFlat + (amount * rate);
        }
      }

      return {
        fee: parseFloat(fee.toFixed(8)),
        rate: rate,
        netAmount: parseFloat((amount - fee).toFixed(8)),
      };
    } catch (err) {
      console.error("Error calculating commission:", err);
      return { fee: 0, rate: 0, netAmount: amount };
    }
  },

  /**
   * Calculate spread for buy/sell operations
   * @param {string} type - 'BUY' or 'SELL'
   * @param {number} marketPrice - Current market price
   * @param {string} userPlan - 'FREE', 'PRO', 'BUSINESS'
   */
  async calculateSpread(type, marketPrice, userPlan = "FREE") {
    const defaultSpread = await this.getSetting("spread_percentage") || 7.0; // Default to 7%
    let spreadPercentage = parseFloat(defaultSpread) / 100;

    // Requirement 3: PRO Features - Relative spread discount
    if (userPlan === "PRO") {
      spreadPercentage = spreadPercentage * 0.8; // 20% discount
    } else if (userPlan === "BUSINESS") {
      spreadPercentage = spreadPercentage * 0.5; // 50% discount
    }

    const spreadAmount = marketPrice * spreadPercentage;
    const finalPrice = type === "BUY"
      ? marketPrice + spreadAmount
      : marketPrice - spreadAmount;

    return {
      marketPrice,
      spreadPercentage,
      spreadAmount,
      finalPrice,
    };
  },

  /**
   * Log revenue to the revenue_logs table
   */
  async logRevenue(
    userId,
    amount,
    currency,
    type,
    sourceTxId = null,
    metadata = {},
  ) {
    const { error } = await supabase
      .from("revenue_logs")
      .insert({
        user_id: userId,
        amount,
        currency,
        revenue_type: type,
        source_transaction_id: sourceTxId,
        metadata,
      });

    if (error) console.error("Error logging revenue:", error);

    // If it's a spread revenue, trigger affiliate commission
    if (type === "spread") {
      await supabase.rpc("add_affiliate_commission", {
        p_referred_user_id: userId,
        p_revenue_amount: amount,
        p_currency: currency,
        p_source_tx_id: sourceTxId,
      });
    }
  },

  async getPlatformWalletId(currency) {
    const { data, error } = await supabase
      .from("platform_wallets")
      .select("wallet_id")
      .eq("currency", currency)
      .maybeSingle();

    if (error) {
      console.error("Error fetching platform wallet:", error);
      return null;
    }

    return data ? data.wallet_id : null;
  },
};

module.exports = commissionService;
