const bip39 = require("bip39");
const { BIP32Factory } = require("bip32");
const tinysecp = require("tiny-secp256k1");
const bitcoin = require("bitcoinjs-lib");
const { ethers } = require("ethers");
const supabase = require("../config/supabase");
const logger = require("../utils/logger");

const bip32 = BIP32Factory(tinysecp);

class WalletService {
  constructor() {
    // Master mnemonic should be stored in env
    this.masterMnemonic = process.env.HD_MASTER_MNEMONIC;
    if (!this.masterMnemonic && process.env.NODE_ENV !== "test") {
      logger.warn(
        "[WalletService] HD_MASTER_MNEMONIC not set. HD wallet derivation will fail.",
      );
    }
  }

  async getMasterSeed() {
    if (!this.masterMnemonic) {
      throw new Error(
        "Master mnemonic not configured. Set HD_MASTER_MNEMONIC environment variable.",
      );
    }
    return await bip39.mnemonicToSeed(this.masterMnemonic);
  }

  /**
   * Derive BTC address (Legacy BIP44)
   * Path: m/44'/0'/0'/0/${index}
   */
  deriveBTC(seed, index) {
    const root = bip32.fromSeed(seed);
    const path = `m/44'/0'/0'/0/${index}`;
    const child = root.derivePath(path);

    const { address } = bitcoin.payments.p2pkh({
      pubkey: child.publicKey,
      network: bitcoin.networks.bitcoin,
    });
    return { address, path };
  }

  /**
   * Derive ETH address (BIP44)
   * Path: m/44'/60'/0'/0/${index}
   */
  deriveETH(seed, index) {
    const root = bip32.fromSeed(seed);
    const path = `m/44'/60'/0'/0/${index}`;
    const child = root.derivePath(path);

    // Use ethers to get the address from the private key
    const wallet = new ethers.Wallet(child.privateKey.toString("hex"));
    return { address: wallet.address, path };
  }

  /**
   * Internal: Derive address based on asset type
   */
  async _derive(asset, index) {
    const seed = await this.getMasterSeed();
    const upAsset = asset.toUpperCase();

    switch (upAsset) {
      case "BTC":
        return this.deriveBTC(seed, index);
      case "ETH":
      case "USDT": // USDT (ERC20) uses Same address as ETH
        return this.deriveETH(seed, index);
      default:
        throw new Error(`Asset ${upAsset} not supported for HD derivation`);
    }
  }

  /**
   * PUBLIC API: Generate a new address for a user
   * Atomically increments index and persists address record
   */
  async generateNewAddress(userId, asset) {
    const upAsset = asset.toUpperCase();
    const assetMap = {
      "USDT": "ETH", // Store USDT as ETH index
      "BTC": "BTC",
      "ETH": "ETH",
    };

    const targetAsset = assetMap[upAsset] || upAsset;

    try {
      logger.info(`Generating new ${upAsset} address for user ${userId}`);

      // 1. Get next index atomically from DB
      const { data: index, error: indexError } = await supabase.rpc(
        "get_and_increment_hd_index",
        {
          p_user_id: userId,
          p_asset: targetAsset,
        },
      );

      if (indexError) throw indexError;

      // 2. Derive the address locally
      const { address, path } = await this._derive(upAsset, index);

      // 3. Persist the address record
      const { error: saveError } = await supabase
        .from("crypto_hd_addresses")
        .insert({
          user_id: userId,
          asset: upAsset,
          address: address,
          derivation_path: path,
          address_index: index,
          status: "unused",
        });

      if (saveError) {
        logger.error("Failed to save generated HD address:", saveError.message);
        throw saveError;
      }

      return {
        address,
        asset: upAsset,
        path,
        index,
      };
    } catch (error) {
      logger.error(
        `HD Address generation failed for ${userId}/${upAsset}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get a list of "unused" addresses for monitoring
   */
  async getUnusedAddresses(limit = 100) {
    const { data, error } = await supabase
      .from("crypto_hd_addresses")
      .select("*")
      .eq("status", "unused")
      .limit(limit);

    if (error) throw error;
    return data;
  }

  /**
   * Mark an address as used when a deposit is detected
   */
  async markAsUsed(address) {
    const { error } = await supabase
      .from("crypto_hd_addresses")
      .update({
        status: "used",
        used_at: new Date().toISOString(),
      })
      .eq("address", address);

    if (error) throw error;
  }
}

module.exports = new WalletService();
