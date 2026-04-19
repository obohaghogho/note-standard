const supabase = require('../config/database');

async function seedProposal() {
    console.log('Seeding malicious/high-drift reconciliation proposal for testing...');

    try {
        // 1. Get a random active wallet
        const { data: wallets, error: wError } = await supabase
            .from('wallets_v6')
            .select('id, asset')
            .limit(1);

        if (wError || !wallets.length) throw new Error('No wallets found');
        const wallet = wallets[0];

        // 2. Insert HIGH drift proposal, eligible immediately
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Backdate to ensure it's eligible
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const { data: proposal, error: pError } = await supabase
            .from('reconciliation_proposals')
            .insert({
                wallet_id: wallet.id,
                asset: wallet.asset,
                currency: wallet.asset, // simplistic
                drift_amount: 15.000, // HIGH drift
                direction: -1, // missing funds
                status: 'AUDITING',
                severity: 'HIGH',
                settlement_epoch_id: 1, // mock epoch
                confidence_score: 1.0,
                eligible_at: yesterday.toISOString(), // Eligible NOW
                expires_at: tomorrow.toISOString(),
                metadata: { test_mock: true }
            })
            .select()
            .single();

        if (pError) throw pError;

        console.log('✅ Successfully seeded HIGH-drift proposal:', proposal.id);
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding failed:', err.message);
        process.exit(1);
    }
}

seedProposal();
