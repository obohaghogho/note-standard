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
   * Iterate through all users/assets and ensure up to 20 addresses lookahead
   */
  async pollAddresses() {
    try {
      logger.info(
        "[BlockchainService] Starting poll with 20-address gap limit...",
      );

      // 1. Get all unique user/asset pairs that have HD indices
      const { data: userAssets, error: fetchError } = await supabase
        .from("crypto_hd_indices")
        .select("user_id, asset, next_index");

      if (fetchError) throw fetchError;
      if (!userAssets || userAssets.length === 0) {
        logger.info("[BlockchainService] No HD indices found to monitor.");
        return;
      }

      for (const { user_id, asset, next_index } of userAssets) {
        // 2. Ensure we have derived and stored up to (next_index + 20)
        // This implements the lookahead/gap limit
        const gapLimit = 20;
        const targetMaxIndex = next_index + gapLimit;

        // Check if we already have these addresses
        const { data: existingAddr, error: addrError } = await supabase
          .from("crypto_hd_addresses")
          .select("address_index, status")
          .eq("user_id", user_id)
          .eq("asset", asset)
          .gte("address_index", next_index)
          .lte("address_index", targetMaxIndex);

        if (addrError) {
          logger.error(
            `Error fetching addresses for ${user_id}/${asset}:`,
            addrError.message,
          );
          continue;
        }

        const existingIndices = new Set(
          existingAddr.map((a) => a.address_index),
        );

        // derive missing addresses in the gap
        for (let i = next_index; i <= targetMaxIndex; i++) {
          if (!existingIndices.has(i)) {
            try {
              await walletService.generateNewAddress(user_id, asset);
            } catch (genError) {
              logger.error(
                `Failed to pre-derive index ${i} for ${user_id}/${asset}:`,
                genError.message,
              );
            }
          }
        }

        // 3. Poll all "unused" addresses for this user/asset
        const { data: unusedForUser, error: unusedError } = await supabase
          .from("crypto_hd_addresses")
          .select("*")
          .eq("user_id", user_id)
          .eq("asset", asset)
          .eq("status", "unused");

        if (unusedError) {
          logger.error(
            `Error fetching unused for ${user_id}/${asset}:`,
            unusedError.message,
          );
          continue;
        }

        for (const addrRecord of unusedForUser) {
          await this.checkAddressActivity(addrRecord);
          // Small delay to respect rate limits
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
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
