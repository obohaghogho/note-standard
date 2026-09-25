const adminController = require('../controllers/adminController');

async function testAdminDashboardApi() {
  console.log('=== TESTING ADMIN FEE REVENUE DASHBOARD API ===\n');

  const req = { query: { range: 'all' } };
  const res = {
    json(data) {
      console.log('API Response Success:', data.success);
      console.log('Generated At:', data.generatedAt);
      console.log('Summary:', JSON.stringify(data.summary, null, 2));
      console.log('Platform Wallets:', JSON.stringify(data.platformWallets, null, 2));
      console.log('Fees by Type:', JSON.stringify(data.feesByType, null, 2));
      console.log('Revenue by Type:', JSON.stringify(data.revenueByType, null, 2));
      console.log(`Recent Fee Transactions Count: ${data.recentFeeTransactions.length}`);
      if (data.recentFeeTransactions.length > 0) {
        console.log('Sample Recent Tx:', JSON.stringify(data.recentFeeTransactions[0], null, 2));
      }
    },
    status(code) {
      console.log('HTTP Status:', code);
      return this;
    }
  };

  const next = (err) => console.error('Next called with error:', err);

  await adminController.getFeeRevenueDashboard(req, res, next);
}

testAdminDashboardApi().catch(console.error);
