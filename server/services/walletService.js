const FiatWalletService = require("./FiatWalletService");
const CryptoWalletService = require("./CryptoWalletService");

/**
 * Unified Wallet Service Facade
 * Routes requests dynamically to FiatWalletService or CryptoWalletService
 * to resolve require issues and maintain architectural backward-compatibility.
 */
class WalletService {
  /**
   * Get all wallets for a user (fiat and crypto combined)
   */
  async getWallets(userId) {
    const [fiat, crypto] = await Promise.all([
      FiatWalletService.getWallets(userId).catch(() => []),
      CryptoWalletService.getWallets(userId).catch(() => [])
    ]);
    return [...fiat, ...crypto];
  }

  /**
   * Create or fetch a wallet
   * @param {string} userId
   * @param {string} currency
   * @param {string} network Default is 'native'
   * @param {boolean} forceNew
   */
  async createWallet(userId, currency, network = "native", forceNew = false) {
    const upCurrency = String(currency).toUpperCase();
    const isCrypto = ["BTC", "ETH", "USDT", "USDC"].includes(upCurrency);

    if (isCrypto) {
      return await CryptoWalletService.createWallet(userId, upCurrency, network || "native", forceNew);
    } else {
      return await FiatWalletService.createWallet(userId, upCurrency);
    }
  }

  /**
   * Unified withdraw flow
   */
  async withdraw(userId, data) {
    const upCurrency = String(data.currency).toUpperCase();
    const isCrypto = ["BTC", "ETH", "USDT", "USDC"].includes(upCurrency);

    if (isCrypto) {
      return await CryptoWalletService.withdraw(userId, data);
    } else {
      return await FiatWalletService.withdraw(userId, data);
    }
  }
}

module.exports = new WalletService();
