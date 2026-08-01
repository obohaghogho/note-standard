'use strict';
/**
 * currencyCapabilities.js
 * =======================
 * Enterprise Baseline Matrix for Payment Rails.
 * Defines default rail structures and operational capabilities for every supported currency.
 *
 * Used as an in-memory fallback & seed configuration for ProviderCapabilityRegistry.
 */

const BASELINE_CURRENCY_CAPABILITIES = {
  NGN: {
    currency: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    type: 'fiat',
    rails: [
      { id: 'ngn_card_dep', name: 'Pay by Card', type: 'card', operations: ['deposit'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 1.5, text: '1.5%' }, limits: { minimum: 100, maximum: 500000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'CreditCard', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'ngn_bank_dep', name: 'Bank Transfer', type: 'bank_transfer', operations: ['deposit'], provider: 'fincra', priority: 2, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Free' }, limits: { minimum: 100, maximum: 10000000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Building2', recommendedScore: 4, recommendationBadge: 'Best Value' },
      { id: 'ngn_dva_dep', name: 'Generate Virtual Account', type: 'virtual_account', operations: ['deposit'], provider: 'fincra', priority: 3, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Free' }, limits: { minimum: 100, maximum: 10000000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Landmark', recommendedScore: 4, recommendationBadge: 'Automated' },
      { id: 'ngn_bank_wd', name: 'Local Bank Transfer', type: 'bank_transfer', operations: ['withdrawal'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 50, percentage: 0, text: '₦50.00' }, limits: { minimum: 100, maximum: 10000000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Building2', recommendedScore: 5, recommendationBadge: 'Recommended' }
    ]
  },
  USD: {
    currency: 'USD',
    name: 'US Dollar',
    symbol: '$',
    type: 'fiat',
    rails: [
      { id: 'usd_card_dep', name: 'Pay by Card', type: 'card', operations: ['deposit'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 2.5, text: '2.5%' }, limits: { minimum: 10, maximum: 5000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'CreditCard', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'usd_ach_dep', name: 'ACH Transfer', type: 'ach', operations: ['deposit'], provider: 'fincra', priority: 2, availability: 'ONLINE', fee: { fixed: 0, percentage: 0.5, text: '0.5%' }, limits: { minimum: 10, maximum: 50000 }, requiredTier: 'FREE', estimatedSettlement: '1-2 Days', icon: 'Landmark', recommendedScore: 4, recommendationBadge: 'Best Value' },
      { id: 'usd_wire_dep', name: 'Wire Transfer', type: 'wire', operations: ['deposit'], provider: 'fincra', priority: 3, availability: 'ONLINE', fee: { fixed: 15, percentage: 0, text: '$15.00' }, limits: { minimum: 100, maximum: 500000 }, requiredTier: 'PRO', estimatedSettlement: 'Same Day', icon: 'Zap', recommendedScore: 3, recommendationBadge: 'High Volume' },
      { id: 'usd_dva_dep', name: 'Virtual USD Account', type: 'virtual_account', operations: ['deposit'], provider: 'fincra', priority: 4, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Free' }, limits: { minimum: 20, maximum: 100000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Landmark', recommendedScore: 4, recommendationBadge: 'Automated' },
      { id: 'usd_ach_wd', name: 'ACH Payout', type: 'ach', operations: ['withdrawal'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 1, percentage: 0, text: '$1.00' }, limits: { minimum: 10, maximum: 50000 }, requiredTier: 'FREE', estimatedSettlement: '1-2 Days', icon: 'Landmark', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'usd_wire_wd', name: 'Wire Payout', type: 'wire', operations: ['withdrawal'], provider: 'fincra', priority: 2, availability: 'ONLINE', fee: { fixed: 25, percentage: 0, text: '$25.00' }, limits: { minimum: 100, maximum: 500000 }, requiredTier: 'PRO', estimatedSettlement: 'Same Day', icon: 'Zap', recommendedScore: 4, recommendationBadge: 'Fast Delivery' }
    ]
  },
  EUR: {
    currency: 'EUR',
    name: 'Euro',
    symbol: '€',
    type: 'fiat',
    rails: [
      { id: 'eur_card_dep', name: 'Pay by Card', type: 'card', operations: ['deposit'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 2.2, text: '2.2%' }, limits: { minimum: 10, maximum: 5000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'CreditCard', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'eur_sepa_dep', name: 'SEPA Transfer', type: 'sepa', operations: ['deposit'], provider: 'fincra', priority: 2, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Free' }, limits: { minimum: 10, maximum: 100000 }, requiredTier: 'FREE', estimatedSettlement: 'Same Day', icon: 'Globe', recommendedScore: 4, recommendationBadge: 'Best Value' },
      { id: 'eur_sepa_wd', name: 'SEPA Payout', type: 'sepa', operations: ['withdrawal'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0.5, percentage: 0, text: '€0.50' }, limits: { minimum: 10, maximum: 100000 }, requiredTier: 'FREE', estimatedSettlement: 'Same Day', icon: 'Globe', recommendedScore: 5, recommendationBadge: 'Recommended' }
    ]
  },
  GBP: {
    currency: 'GBP',
    name: 'British Pound',
    symbol: '£',
    type: 'fiat',
    rails: [
      { id: 'gbp_card_dep', name: 'Pay by Card', type: 'card', operations: ['deposit'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 2.2, text: '2.2%' }, limits: { minimum: 10, maximum: 5000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'CreditCard', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'gbp_fp_dep', name: 'UK Faster Payments', type: 'faster_payments', operations: ['deposit'], provider: 'fincra', priority: 2, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Free' }, limits: { minimum: 5, maximum: 250000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Zap', recommendedScore: 4, recommendationBadge: 'Best Value' },
      { id: 'gbp_fp_wd', name: 'UK Faster Payments Payout', type: 'faster_payments', operations: ['withdrawal'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0.5, percentage: 0, text: '£0.50' }, limits: { minimum: 5, maximum: 250000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Zap', recommendedScore: 5, recommendationBadge: 'Recommended' }
    ]
  },
  TZS: {
    currency: 'TZS',
    name: 'Tanzanian Shilling',
    symbol: 'TSh',
    type: 'fiat',
    rails: [
      { id: 'tzs_momo_dep', name: 'Mobile Money (M-Pesa / Tigo)', type: 'mobile_money', operations: ['deposit'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 1.0, text: '1.0%' }, limits: { minimum: 1000, maximum: 10000000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Smartphone', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'tzs_bank_dep', name: 'Bank Transfer', type: 'bank_transfer', operations: ['deposit'], provider: 'fincra', priority: 2, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Free' }, limits: { minimum: 1000, maximum: 50000000 }, requiredTier: 'FREE', estimatedSettlement: 'Same Day', icon: 'Building2', recommendedScore: 4, recommendationBadge: 'Best Value' },
      { id: 'tzs_momo_wd', name: 'Mobile Money Payout', type: 'mobile_money', operations: ['withdrawal'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 500, percentage: 0, text: 'TSh 500' }, limits: { minimum: 1000, maximum: 10000000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Smartphone', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'tzs_bank_wd', name: 'Local Bank Payout', type: 'bank_transfer', operations: ['withdrawal'], provider: 'fincra', priority: 2, availability: 'ONLINE', fee: { fixed: 1000, percentage: 0, text: 'TSh 1000' }, limits: { minimum: 1000, maximum: 50000000 }, requiredTier: 'FREE', estimatedSettlement: 'Same Day', icon: 'Building2', recommendedScore: 4, recommendationBadge: 'Standard' }
    ]
  },
  ZAR: {
    currency: 'ZAR',
    name: 'South African Rand',
    symbol: 'R',
    type: 'fiat',
    rails: [
      { id: 'zar_eft_dep', name: 'South Africa EFT', type: 'eft', operations: ['deposit'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 0.8, text: '0.8%' }, limits: { minimum: 50, maximum: 500000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'ShieldCheck', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'zar_bank_dep', name: 'Bank Transfer', type: 'bank_transfer', operations: ['deposit'], provider: 'fincra', priority: 2, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Free' }, limits: { minimum: 50, maximum: 1000000 }, requiredTier: 'FREE', estimatedSettlement: 'Same Day', icon: 'Building2', recommendedScore: 4, recommendationBadge: 'Best Value' },
      { id: 'zar_eft_wd', name: 'South Africa EFT Payout', type: 'eft', operations: ['withdrawal'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 10, percentage: 0, text: 'R10.00' }, limits: { minimum: 50, maximum: 500000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'ShieldCheck', recommendedScore: 5, recommendationBadge: 'Recommended' }
    ]
  },
  GHS: {
    currency: 'GHS',
    name: 'Ghanaian Cedi',
    symbol: 'GH₵',
    type: 'fiat',
    rails: [
      { id: 'ghs_momo_dep', name: 'Mobile Money (MTN / Vodafone)', type: 'mobile_money', operations: ['deposit'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 1.0, text: '1.0%' }, limits: { minimum: 5, maximum: 20000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Smartphone', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'ghs_bank_dep', name: 'Bank Transfer', type: 'bank_transfer', operations: ['deposit'], provider: 'fincra', priority: 2, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Free' }, limits: { minimum: 5, maximum: 50000 }, requiredTier: 'FREE', estimatedSettlement: 'Same Day', icon: 'Building2', recommendedScore: 4, recommendationBadge: 'Best Value' },
      { id: 'ghs_momo_wd', name: 'Mobile Money Payout', type: 'mobile_money', operations: ['withdrawal'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 2, percentage: 0, text: 'GH₵2.00' }, limits: { minimum: 5, maximum: 20000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Smartphone', recommendedScore: 5, recommendationBadge: 'Recommended' }
    ]
  },
  KES: {
    currency: 'KES',
    name: 'Kenyan Shilling',
    symbol: 'KSh',
    type: 'fiat',
    rails: [
      { id: 'kes_momo_dep', name: 'Mobile Money (M-Pesa)', type: 'mobile_money', operations: ['deposit'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 1.0, text: '1.0%' }, limits: { minimum: 100, maximum: 300000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Smartphone', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'kes_bank_dep', name: 'Bank Transfer', type: 'bank_transfer', operations: ['deposit'], provider: 'fincra', priority: 2, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Free' }, limits: { minimum: 100, maximum: 1000000 }, requiredTier: 'FREE', estimatedSettlement: 'Same Day', icon: 'Building2', recommendedScore: 4, recommendationBadge: 'Best Value' },
      { id: 'kes_momo_wd', name: 'Mobile Money Payout', type: 'mobile_money', operations: ['withdrawal'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 50, percentage: 0, text: 'KSh 50' }, limits: { minimum: 100, maximum: 300000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Smartphone', recommendedScore: 5, recommendationBadge: 'Recommended' }
    ]
  },
  CAD: {
    currency: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'CA$',
    type: 'fiat',
    rails: [
      { id: 'cad_bank_dep', name: 'Bank Transfer / EFT', type: 'bank_transfer', operations: ['deposit'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Free' }, limits: { minimum: 10, maximum: 100000 }, requiredTier: 'FREE', estimatedSettlement: 'Same Day', icon: 'Building2', recommendedScore: 5, recommendationBadge: 'Recommended' },
      { id: 'cad_bank_wd', name: 'Bank Transfer Payout', type: 'bank_transfer', operations: ['withdrawal'], provider: 'fincra', priority: 1, availability: 'ONLINE', fee: { fixed: 2, percentage: 0, text: 'CA$2.00' }, limits: { minimum: 10, maximum: 100000 }, requiredTier: 'FREE', estimatedSettlement: 'Same Day', icon: 'Building2', recommendedScore: 5, recommendationBadge: 'Recommended' }
    ]
  },
  USDT: {
    currency: 'USDT',
    name: 'Tether USD',
    symbol: '₮',
    type: 'crypto',
    rails: [
      { id: 'usdt_fx_dep', name: 'Crypto FX Settlement', type: 'fx_settlement', operations: ['deposit'], provider: 'nowpayments', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Network Fee Only' }, limits: { minimum: 10, maximum: 1000000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Bitcoin', recommendedScore: 5, recommendationBadge: 'Recommended' }
    ]
  },
  USDC: {
    currency: 'USDC',
    name: 'USD Coin',
    symbol: '$',
    type: 'crypto',
    rails: [
      { id: 'usdc_fx_dep', name: 'Crypto FX Settlement', type: 'fx_settlement', operations: ['deposit'], provider: 'nowpayments', priority: 1, availability: 'ONLINE', fee: { fixed: 0, percentage: 0, text: 'Network Fee Only' }, limits: { minimum: 10, maximum: 1000000 }, requiredTier: 'FREE', estimatedSettlement: 'Instant', icon: 'Bitcoin', recommendedScore: 5, recommendationBadge: 'Recommended' }
    ]
  }
};

module.exports = {
  BASELINE_CURRENCY_CAPABILITIES
};
