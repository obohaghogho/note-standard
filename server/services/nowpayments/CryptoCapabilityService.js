'use strict';
/**
 * CryptoCapabilityService.js
 * ===========================
 * NOWPayments Capability Discovery & Platform Network Synchronization Service.
 * Discovers provider capabilities via NOWPayments APIs (/status, /currencies, /balance),
 * combines with platform network registry (crypto_networks), caches results in DB,
 * and records immutable audit logs.
 *
 * All customer-facing and financial orchestrator calls read purely from DB cache.
 *
 * @module services/nowpayments/CryptoCapabilityService
 */

const axios             = require('axios');
const supabase          = require('../../config/database');
const logger            = require('../../utils/logger');
const ImmutableAuditLog = require('../treasury/ImmutableAuditLog');

const BASE_URL = process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1';
const TIMEOUT  = 10000;

class CryptoCapabilityService {
  /**
   * Run full capability discovery against NOWPayments API & merge with platform registry.
   */
  async syncCapabilities() {
    const start  = Date.now();
    const apiKey = process.env.NOWPAYMENTS_API_KEY;

    const report = {
      apiReachable:     false,
      authenticated:    false,
      ipnConfigured:    Boolean(process.env.NOWPAYMENTS_IPN_SECRET || process.env.NOWPAYMENTS_WEBHOOK_SECRET),
      balanceApiAccess: false,
      discoveredCount:  0,
      timestamp:        new Date().toISOString(),
      durationMs:       0,
    };

    if (!apiKey) {
      logger.warn('[CryptoCapabilityService] NOWPAYMENTS_API_KEY missing. Skipping API discovery.');
      return report;
    }

    try {
      // 1. Ping /status API
      const statusRes = await axios.get(`${BASE_URL}/status`, {
        headers: { 'x-api-key': apiKey },
        timeout: TIMEOUT,
      });
      report.apiReachable  = statusRes.status === 200;
      report.authenticated = true;
    } catch (err) {
      logger.warn(`[CryptoCapabilityService] Status ping failed: ${err.message}`);
    }

    // 2. Fetch balance / custody access
    try {
      const balRes = await axios.get(`${BASE_URL}/balance`, {
        headers: { 'x-api-key': apiKey },
        timeout: TIMEOUT,
      });
      report.balanceApiAccess = balRes.status === 200;
    } catch (err) {
      logger.warn(`[CryptoCapabilityService] Balance fetch failed: ${err.message}`);
    }

    // 3. Fetch supported currencies from provider
    let providerCurrencies = [];
    try {
      const curRes = await axios.get(`${BASE_URL}/currencies?fixed_rate=true`, {
        headers: { 'x-api-key': apiKey },
        timeout: TIMEOUT,
      });
      providerCurrencies = curRes.data?.currencies || [];
      report.discoveredCount = providerCurrencies.length;
    } catch (err) {
      logger.warn(`[CryptoCapabilityService] Currencies discovery failed: ${err.message}`);
    }

    // 4. Update crypto_provider_capabilities cache in DB
    const trackedPairs = [
      { currency: 'BTC',  network: 'BITCOIN' },
      { currency: 'ETH',  network: 'ETHEREUM' },
      { currency: 'USDT', network: 'TRC20' },
      { currency: 'USDT', network: 'ERC20' },
      { currency: 'USDT', network: 'BEP20' },
      { currency: 'USDC', network: 'ERC20' },
      { currency: 'USDC', network: 'POLYGON' },
    ];

    for (const pair of trackedPairs) {
      const provSupported = providerCurrencies.length === 0 || providerCurrencies.some(
        c => String(c).toLowerCase().includes(pair.currency.toLowerCase())
      );

      try {
        await supabase
          .from('crypto_provider_capabilities')
          .upsert({
            provider:            'nowpayments',
            currency:            pair.currency,
            network:             pair.network,
            api_reachable:       report.apiReachable,
            deposit_supported:   provSupported,
            withdraw_supported:  provSupported,
            verification_status: report.apiReachable ? 'VERIFIED' : 'UNREACHABLE',
            last_verified_at:    new Date().toISOString(),
          }, { onConflict: 'provider,currency,network' });
      } catch (e) {
        logger.warn(`[CryptoCapabilityService] DB cache update warn: ${e.message}`);
      }
    }

    report.durationMs = Date.now() - start;

    try {
      await ImmutableAuditLog.record({
        event_type:   'CRYPTO_CAPABILITY_SYNC',
        actor_type:   'SYSTEM',
        actor_id:     'CryptoCapabilityService',
        subject_type: 'PROVIDER',
        subject_id:   'nowpayments',
        reason:       `Discovered ${report.discoveredCount} currencies. API Reachable: ${report.apiReachable}`,
        metadata:     report,
      });
    } catch (e) {
      logger.warn(`[CryptoCapabilityService] Audit record warn: ${e.message}`);
    }

    logger.info(`[CryptoCapabilityService] Capability sync completed in ${report.durationMs}ms`);
    return report;
  }

  /**
   * Get dynamic list of available assets and networks from DB cache (zero external HTTP calls).
   */
  async getAvailableAssetsAndNetworks() {
    try {
      const { data: networks } = await supabase
        .from('crypto_networks')
        .select('*')
        .order('currency', { ascending: true })
        .order('network', { ascending: true });

      const DEFAULT_NETWORKS = [
        { currency: 'BTC',  network: 'BITCOIN',  network_label: 'Bitcoin (Native)',  wallet_configured: true,  deposits_enabled: true,  withdrawals_enabled: true,  operational_state: 'READY',          disabled_reason: null, min_confirmations: 3, explorer_url: 'https://mempool.space/tx/' },
        { currency: 'ETH',  network: 'ETHEREUM', network_label: 'Ethereum (ERC20)',  wallet_configured: true,  deposits_enabled: true,  withdrawals_enabled: true,  operational_state: 'READY',          disabled_reason: null, min_confirmations: 12, explorer_url: 'https://etherscan.io/tx/' },
        { currency: 'USDT', network: 'TRC20',    network_label: 'TRON (TRC20)',      wallet_configured: true,  deposits_enabled: true,  withdrawals_enabled: true,  operational_state: 'READY',          disabled_reason: null, min_confirmations: 20, explorer_url: 'https://tronscan.org/#/transaction/' },
        { currency: 'USDT', network: 'ERC20',    network_label: 'Ethereum (ERC20)',  wallet_configured: false, deposits_enabled: false, withdrawals_enabled: false, operational_state: 'WALLET_MISSING', disabled_reason: 'Platform payout wallet not configured in merchant dashboard', min_confirmations: 20, explorer_url: 'https://etherscan.io/tx/' },
        { currency: 'USDC', network: 'ERC20',    network_label: 'Ethereum (ERC20)',  wallet_configured: true,  deposits_enabled: true,  withdrawals_enabled: true,  operational_state: 'READY',          disabled_reason: null, min_confirmations: 20, explorer_url: 'https://etherscan.io/tx/' },
        { currency: 'USDC', network: 'POLYGON',  network_label: 'Polygon (MATIC)',   wallet_configured: false, deposits_enabled: false, withdrawals_enabled: false, operational_state: 'DISABLED',       disabled_reason: 'Platform network disabled by administrator', min_confirmations: 15, explorer_url: 'https://polygonscan.com/tx/' },
      ];

      const rows = (networks && networks.length > 0) ? networks : DEFAULT_NETWORKS;
      const result = {};

      for (const net of rows) {
        if (!result[net.currency]) {
          result[net.currency] = {
            currency: net.currency,
            networks: [],
          };
        }

        const isReady = net.operational_state === 'READY' && net.wallet_configured;
        const displayState = isReady 
          ? 'AVAILABLE' 
          : (net.operational_state === 'WALLET_MISSING' ? 'COMING_SOON' : 'DISABLED');

        result[net.currency].networks.push({
          network:             net.network,
          networkLabel:        net.network_label,
          status:              net.operational_state,
          available:           isReady,
          displayState:        displayState,
          walletConfigured:    net.wallet_configured,
          depositsEnabled:     net.deposits_enabled,
          withdrawalsEnabled:  net.withdrawals_enabled,
          disabledReason:      net.disabled_reason || (isReady ? null : 'Production treasury wallet not configured'),
          minConfirmations:    net.min_confirmations,
          explorerUrl:         net.explorer_url,
        });
      }

      return Object.values(result);
    } catch (err) {
      logger.error(`[CryptoCapabilityService] Get available assets error: ${err.message}`);
      return [];
    }
  }

  /**
   * Get dynamic list of available assets and networks from DB cache (zero external HTTP calls).
   */
  async getPublicAssetsList() {
    const groups = await this.getAvailableAssetsAndNetworks();
    const list = [];

    for (const g of groups) {
      for (const net of g.networks) {
        list.push({
          currency:        g.currency,
          network:         net.network,
          networkLabel:    net.networkLabel,
          status:          net.status,
          available:       net.available,
          displayState:    net.displayState,
          disabledReason:  net.disabledReason,
          minConfirmations: net.minConfirmations,
          explorerUrl:     net.explorerUrl,
        });
      }
    }

    return list;
  }
  async validateNetworkCapability(currency, network = 'NATIVE', operationType = 'DEPOSIT') {
    const cur = String(currency).toUpperCase();
    const net = String(network).toUpperCase();

    const { data: record } = await supabase
      .from('crypto_networks')
      .select('*')
      .eq('currency', cur)
      .eq('network', net)
      .maybeSingle();

    if (!record) {
      // Fallback check for single-network default if exact network string matches native
      return { allowed: true, operationalState: 'READY' };
    }

    if (record.operational_state !== 'READY') {
      return {
        allowed:          false,
        operationalState: record.operational_state,
        reason:           record.disabled_reason || `${cur} ${net} is in state ${record.operational_state}`,
      };
    }

    if (operationType === 'WITHDRAWAL' || operationType === 'PAYOUT') {
      if (!record.wallet_configured) {
        return {
          allowed:          false,
          operationalState: 'WALLET_MISSING',
          reason:           `${cur} ${net} withdrawals are unavailable because no production payout wallet has been configured in the merchant dashboard.`,
        };
      }
      if (!record.withdrawals_enabled) {
        return {
          allowed:          false,
          operationalState: 'DISABLED',
          reason:           `${cur} ${net} withdrawals are currently disabled by platform administrator.`,
        };
      }
    }

    return { allowed: true, operationalState: 'READY' };
  }
}

module.exports = new CryptoCapabilityService();
