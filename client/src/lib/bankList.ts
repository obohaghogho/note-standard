
export interface Bank {
  id: string;
  name: string;
  code: string;
  country: string;
  slug?: string;
}

// Minimal list of popular banks for demonstration.
// In a real app, this should be fetched from an API (e.g., Paystack/Flutterwave /banks endpoint).
export const POPULAR_BANKS: Bank[] = [
  // Nigeria
  { id: 'ng-1', name: 'Access Bank', code: '044', country: 'Nigeria', slug: 'access-bank' },
  { id: 'ng-2', name: 'Guaranty Trust Bank', code: '058', country: 'Nigeria', slug: 'gtbank' },
  { id: 'ng-3', name: 'Zenith Bank', code: '057', country: 'Nigeria', slug: 'zenith-bank' },
  { id: 'ng-4', name: 'United Bank for Africa', code: '033', country: 'Nigeria', slug: 'uba' },
  { id: 'ng-5', name: 'First Bank of Nigeria', code: '011', country: 'Nigeria', slug: 'first-bank' },
  { id: 'ng-6', name: 'Kuda Bank', code: '50211', country: 'Nigeria', slug: 'kuda-bank' },
  
  // USA (Routing numbers are usually user-input, but listing major ones for autocomplete)
  { id: 'us-1', name: 'Chase Bank', code: '021000021', country: 'United States' },
  { id: 'us-2', name: 'Bank of America', code: '026009593', country: 'United States' },
  { id: 'us-3', name: 'Wells Fargo', code: '121000248', country: 'United States' },

  // UK
  { id: 'uk-1', name: 'Barclays', code: '20-00-00', country: 'United Kingdom' },
  { id: 'uk-2', name: 'HSBC', code: '40-00-00', country: 'United Kingdom' },
  { id: 'uk-3', name: 'Lloyds Bank', code: '30-00-00', country: 'United Kingdom' },
  { id: 'uk-4', name: 'Revolut', code: '04-00-75', country: 'United Kingdom' },

  // Ghana
  { id: 'gh-1', name: 'GCB Bank', code: 'GCBLGHAC', country: 'Ghana', slug: 'gcb-bank' },
  { id: 'gh-2', name: 'Ecobank Ghana', code: 'EABORHAC', country: 'Ghana', slug: 'ecobank-ghana' },
  { id: 'gh-3', name: 'Stanbic Bank Ghana', code: 'SBICGHAC', country: 'Ghana', slug: 'stanbic-ghana' },
  { id: 'gh-4', name: 'Absa Bank Ghana', code: 'BABORHAC', country: 'Ghana', slug: 'absa-ghana' },
  { id: 'gh-5', name: 'Fidelity Bank Ghana', code: 'FABORHAC', country: 'Ghana', slug: 'fidelity-ghana' },
  { id: 'gh-6', name: 'CalBank', code: 'ACCEGHAC', country: 'Ghana', slug: 'calbank' },
  { id: 'gh-7', name: 'First National Bank Ghana', code: 'FABORHAC', country: 'Ghana', slug: 'fnb-ghana' },
  { id: 'gh-8', name: 'Republic Bank Ghana', code: 'HABORHAC', country: 'Ghana', slug: 'republic-ghana' },
  { id: 'gh-9', name: 'MTN Mobile Money', code: 'MTN_MOMO', country: 'Ghana', slug: 'mtn-momo' },
  { id: 'gh-10', name: 'Vodafone Cash', code: 'VODA_CASH', country: 'Ghana', slug: 'vodafone-cash' },
  { id: 'gh-11', name: 'AirtelTigo Money', code: 'TIGO_CASH', country: 'Ghana', slug: 'airteltigo-money' },
];

export const COUNTRIES = [
  { code: 'NG', name: 'Nigeria', currency: 'NGN' },
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'EU', name: 'Europe', currency: 'EUR' },
  { code: 'KE', name: 'Kenya', currency: 'KES' },
  { code: 'GH', name: 'Ghana', currency: 'GHS' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
];
