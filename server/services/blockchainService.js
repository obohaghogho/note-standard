const axios = require("axios");
const walletService = require("./walletService");
const logger = require("../utils/logger");
const supabase = require("../config/supabase");

class BlockchainService {
  constructor() {
    this.isMonitoring = false;
    this.interval = null;
    this.pollInterval = parseInt(process.env.BLOCKCHAIN_POLL_INTERVAL) ||
      600000; // Default 10 mins
  }

  /**
   * Start the background monitoring task
   */
  startMonitoring() {
    if (this.isMonitoring) return;

    logger.info(
      `Starting Blockchain Monitoring Service (polling every ${
        this.pollInterval / 1000
      }s)`,
    );
    this.isMonitoring = true;

    // Initial run
    this.pollAddresses();

    // Schedule periodic runs
    this.interval = setInterval(() => this.pollAddresses(), this.pollInterval);
  }

  /**
   * Stop the background monitoring task
   */
  stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isMonitoring = false;
    logger.info("Blockchain Monitoring Service stopped.");
  }

  /**
   * Iterate through all unused addresses and check for balances
   */
  async pollAddresses() {
    try {
      logger.info(
        "[BlockchainService] Polling unused HD addresses for activity...",
      );

      // Get addresses that are 'unused' and not 'expired'
      const { data: addresses, error } = await supabase
        .from("crypto_hd_addresses")
        .select("*")
        .eq("status", "unused")
        .order("created_at", { ascending: true })
        .limit(50); // Process in manageable batches

      if (error) throw error;
      if (!addresses || addresses.length === 0) {
        logger.info("[BlockchainService] No unused addresses to poll.");
        return;
      }

      for (const addrRecord of addresses) {
        await this.checkAddressActivity(addrRecord);
        // Respect rate limits of public APIs
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      logger.error("[BlockchainService] Polling error:", error.message);
    }
  }

  /**
   * Check a single address for external activity/balance
   */
  async checkAddressActivity(record) {
    const { address, asset, user_id } = record;

    try {
      let balance = 0;
      let txCount = 0;

      if (asset === "BTC") {
        // Using Blockchain.info public API (No key required for small counts)
        const resp = await axios.get(
          `https://blockchain.info/rawaddr/${address}`,
        );
        balance = resp.data.total_received / 100000000;
        txCount = resp.data.n_tx;
      } else if (asset === "ETH" || asset === "USDT") {
        // Using Etherscan (Requires API Key for reliability, but has public limited access)
        const apiKey = process.env.ETHERSCAN_API_KEY || "YourApiKeyToken";
        const url =
          `https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
        const resp = await axios.get(url);
        if (resp.data.status === "1") {
          balance = parseFloat(resp.data.result) / 1e18;
          txCount = balance > 0 ? 1 : 0; // Simplified for ETH
        }
      }

      if (balance > 0 || txCount > 0) {
        logger.info(
          `[BlockchainService] Activity detected on ${asset} address ${address}: balance ${balance}`,
        );

        // 1. Mark address as used
        await walletService.markAsUsed(address);

        // 2. TODO: Trigger internal deposit processing
        // This would involve creating a transaction record if it doesn't exist
        // and calling confirmDeposit after enough confirmations.
        logger.info(
          `[BlockchainService] Address ${address} marked as used. Pushing for internal verification.`,
        );

        // For this implementation, we just mark it as used to prevent further use.
      }
    } catch (error) {
      // Log but don't stop the whole service
      if (error.response?.status === 429) {
        logger.warn(`[BlockchainService] Rate limited for ${address}`);
      } else {
        logger.debug(
          `[BlockchainService] Error checking ${address}: ${error.message}`,
        );
      }
    }
  }
}

module.exports = new BlockchainService();
