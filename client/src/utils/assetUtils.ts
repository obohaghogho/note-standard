/**
 * Asset Normalization Utilities (v1.0)
 *
 * RULE: No raw backend objects should ever reach the UI directly.
 * Every wallet/asset/pair must pass through one of these functions.
 * This prevents "undefined" leaks permanently as new assets are added.
 */

// Known network display names
const NETWORK_LABELS: Record<string, string> = {
  native: 'Native',
  bitcoin: 'Bitcoin',
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  bsc: 'BSC',
  tron: 'Tron',
  internal: 'Internal',
  INTERNAL: 'Internal',
  BITCOIN: 'Bitcoin',
  ETHEREUM: 'Ethereum',
};

// Currency symbols
const CURRENCY_SYMBOLS: Record<string, string> = {
  BTC: '₿',
  ETH: 'Ξ',
  USD: '$',
  NGN: '₦',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  USDT: '₮',
  USDC: 'U',
};

export interface NormalizedAsset {
  symbol: string;           // e.g. "BTC"
  network: string;          // e.g. "native" → always a string, never undefined
  networkLabel: string;     // e.g. "Native" — display-safe
  displayLabel: string;     // e.g. "BTC" or "BTC (Ethereum)"
  currencySymbol: string;   // e.g. "₿"
  optionValue: string;      // e.g. "BTC_native" — safe for <select> value
}

export interface NormalizedBalance {
  raw: number;              // The actual numeric balance
  display: string;          // Formatted string e.g. "0.00123456 BTC"
  usdDisplay: string;       // USD valuation e.g. "≈ $1,234.56" or "≈ $0.00"
  isHidden: boolean;        // Whether to show ••• instead
}

export interface NormalizedPair {
  from: NormalizedAsset;
  to: NormalizedAsset;
  label: string;            // e.g. "BTC → USD"
}

/**
 * Normalize a raw asset/wallet entry.
 * Safe to call with null, undefined, or malformed objects.
 */
export function normalizeAsset(raw: {
  asset?: string;
  currency?: string;
  symbol?: string;
  network?: string | null;
} | null | undefined): NormalizedAsset {
  const symbol = (raw?.asset || raw?.currency || raw?.symbol || 'UNKNOWN')
    .toUpperCase()
    .trim();

  // Defensive: treat undefined, null, "undefined", "", "null" as native
  const rawNet = raw?.network;
  const network = (!rawNet || rawNet === 'undefined' || rawNet === 'null')
    ? 'native'
    : rawNet.trim();

  const networkLabel = NETWORK_LABELS[network] || network;
  const currencySymbol = CURRENCY_SYMBOLS[symbol] || symbol.charAt(0);

  // Only show network suffix for non-primary networks
  const showNetwork = network && network !== 'native' && network !== 'internal' && network !== 'INTERNAL';
  const displayLabel = showNetwork ? `${symbol} (${networkLabel})` : symbol;

  return {
    symbol,
    network,
    networkLabel,
    displayLabel,
    currencySymbol,
    optionValue: `${symbol}_${network}`,
  };
}

/**
 * Normalize a raw balance display object.
 * Ensures no undefined or NaN values reach the UI.
 */
export function normalizeBalance(raw: {
  balance?: string | number | null;
  available?: string | number | null;
  valuationUsd?: string | null;
  asset?: string;
}, showBalances = true): NormalizedBalance {
  const symbol = (raw?.asset || '').toUpperCase();
  const rawBalance = parseFloat(String(raw?.balance ?? '0')) || 0;

  // Format with appropriate decimals per currency type
  const isCrypto = ['BTC', 'ETH', 'USDT', 'USDC'].includes(symbol);
  const decimals = isCrypto ? 8 : 2;
  const formattedBalance = rawBalance.toFixed(decimals);

  const usdRaw = raw?.valuationUsd;
  const usdDisplay = usdRaw && usdRaw !== '$0.00' ? `≈ ${usdRaw}` : '≈ $0.00';

  return {
    raw: rawBalance,
    display: showBalances ? `${formattedBalance} ${symbol}`.trim() : '••••••••',
    usdDisplay: showBalances ? usdDisplay : '≈ ••••',
    isHidden: !showBalances,
  };
}

/**
 * Normalize a currency pair for display.
 */
export function normalizePair(
  fromRaw: Parameters<typeof normalizeAsset>[0],
  toRaw: Parameters<typeof normalizeAsset>[0],
): NormalizedPair {
  const from = normalizeAsset(fromRaw);
  const to = normalizeAsset(toRaw);
  return {
    from,
    to,
    label: `${from.symbol} → ${to.symbol}`,
  };
}

/**
 * Parse a composite option value back to symbol+network.
 * e.g. "BTC_native" -> { symbol: "BTC", network: "native" }
 */
export function parseOptionValue(val: string): { symbol: string; network: string } {
  if (!val || typeof val !== 'string') return { symbol: 'UNKNOWN', network: 'native' };
  const idx = val.indexOf('_');
  if (idx === -1) return { symbol: val.toUpperCase(), network: 'native' };
  return {
    symbol: val.substring(0, idx).toUpperCase(),
    network: val.substring(idx + 1) || 'native',
  };
}
