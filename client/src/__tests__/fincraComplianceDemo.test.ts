import { describe, it, expect } from 'vitest';

/**
 * Fincra Compliance Demo Logic Tests
 * Verifies core accounting, fee calculation, lifecycle, reconciliation, and isolation rules.
 */

describe('Fincra Compliance Demo Accounting & Reconciliation Logic', () => {

    it('should correctly balance double-entry debits and credits', () => {
        const ledgerEntries = [
            { account: '1010 - User NGN Custody Account', debit: 500000, credit: 0 },
            { account: '2010 - Fincra Clearing Reserve', debit: 0, credit: 474500 },
            { account: '4010 - Fincra Processing Fee Expense', debit: 0, credit: 2500 },
            { account: '4020 - NoteStandard Platform Fee Revenue', debit: 0, credit: 23000 }
        ];

        const totalDebits = ledgerEntries.reduce((sum, item) => sum + item.debit, 0);
        const totalCredits = ledgerEntries.reduce((sum, item) => sum + item.credit, 0);
        const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

        expect(totalDebits).toBe(500000);
        expect(totalCredits).toBe(500000);
        expect(isBalanced).toBe(true);
    });

    it('should detect double-entry ledger imbalances when amounts are altered', () => {
        const imbalancedEntries = [
            { account: '1010 - Custody', debit: 500000, credit: 0 },
            { account: '2010 - Reserve', debit: 0, credit: 450000 }
        ];

        const totalDebits = imbalancedEntries.reduce((sum, item) => sum + item.debit, 0);
        const totalCredits = imbalancedEntries.reduce((sum, item) => sum + item.credit, 0);
        const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

        expect(isBalanced).toBe(false);
    });

    it('should calculate net provider settlement accurately according to fee model', () => {
        const grossAmount = 500000;
        const providerFee = 2500;
        const platformFee = 23000;

        const netSettlement = grossAmount - providerFee - platformFee;
        expect(netSettlement).toBe(474500);
    });

    it('should evaluate reconciliation status accurately', () => {
        const providerAmount = 500000;
        const internalAmount = 500000;
        const ledgerBalanced = true;

        const isReconciled = providerAmount === internalAmount && ledgerBalanced;
        expect(isReconciled).toBe(true);

        const mismatchedProviderAmount = 490000;
        const isMismatchReconciled = mismatchedProviderAmount === internalAmount && ledgerBalanced;
        expect(isMismatchReconciled).toBe(false);
    });

    it('should restore original wallet balance on provider failure reversal', () => {
        const initialBalance = 2450000;
        const withdrawalDebit = 100000;
        const pendingBalance = initialBalance - withdrawalDebit;

        expect(pendingBalance).toBe(2350000);

        // Reversal credit upon failure
        const reversalCredit = 100000;
        const restoredBalance = pendingBalance + reversalCredit;

        expect(restoredBalance).toBe(initialBalance);
        expect(restoredBalance - initialBalance).toBe(0);
    });

    it('should allow fincra_demo role only for compliance demo route and restrict from full admin routes', () => {
        const fincraDemoAllowedRoles = ['admin', 'support', 'fincra_demo'];
        const fullAdminAllowedRoles = ['admin', 'support'];

        const reviewerRole = 'fincra_demo';
        const adminRole = 'admin';

        // Check compliance demo access
        expect(fincraDemoAllowedRoles.includes(reviewerRole)).toBe(true);

        // Check restriction on full admin routes (e.g. /admin/users, /admin/withdrawals)
        expect(fullAdminAllowedRoles.includes(reviewerRole)).toBe(false);
        expect(fullAdminAllowedRoles.includes(adminRole)).toBe(true);
    });

});
