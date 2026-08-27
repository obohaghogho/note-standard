import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * NOTEStandard Frontend Currency Policy Compliance Suite
 * Ensures normal fiat wallet UI choices are strictly limited to NGN, USD, GHS.
 * Catches regressions where legacy arrays ['USD', 'EUR', 'GBP', 'NGN'] are reintroduced.
 */
describe('NOTEStandard Frontend Currency Policy Compliance', () => {
  const rootDir = path.resolve(__dirname, '../..');

  it('Billing.tsx must not contain legacy currency array containing EUR/GBP as normal wallet options', () => {
    const filePath = path.join(rootDir, 'src/pages/dashboard/Billing.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Reject legacy array ['USD', 'EUR', 'GBP', 'NGN']
    expect(content).not.toContain("['USD', 'EUR', 'GBP', 'NGN']");
    expect(content).not.toContain('["USD", "EUR", "GBP", "NGN"]');

    // Must contain active normal fiat currency array ['NGN', 'USD', 'GHS']
    expect(content).toContain("['NGN', 'USD', 'GHS']");
  });

  it('FundModal.tsx must not expose EUR/GBP in normal fiat funding buttons', () => {
    const filePath = path.join(rootDir, 'src/components/wallet/FundModal.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toContain("['USD', 'EUR', 'GBP', 'NGN']");
    expect(content).toContain("['NGN', 'USD', 'GHS']");
  });

  it('DepositPage.tsx must not list EUR or GBP in normal fiat deposit choices', () => {
    const filePath = path.join(rootDir, 'src/pages/dashboard/DepositPage.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toContain('{ label: "Euro (EUR)", value: "EUR" }');
    expect(content).not.toContain('{ label: "British Pound (GBP)", value: "GBP" }');
    expect(content).toContain('{ label: "Ghanaian Cedi (GHS)", value: "GHS" }');
  });

  it('walletApi.ts fallback must use NGN, USD, GHS for normal fiat wallets', () => {
    const filePath = path.join(rootDir, 'src/api/walletApi.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toContain("const fiatCodes = ['NGN', 'USD', 'EUR', 'GBP'];");
    expect(content).toContain("const fiatCodes = ['NGN', 'USD', 'GHS'];");
  });
});
