const request = require('supertest');
const app = require('../app');

describe('Enterprise Feedback & Issue Tracking API v1', () => {
  it('should reject spam submission with honeypot field', async () => {
    const res = await request(app)
      .post('/api/v1/feedback/reports')
      .send({
        report: { title: 'Spam Report', description: 'Bot testing' },
        honeypot: 'bot_filled_value'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('should accept valid report submission', async () => {
    const res = await request(app)
      .post('/api/v1/feedback/reports')
      .send({
        report: {
          title: 'PIN Confirmation Failure',
          description: 'Transfer failed after PIN confirmation on payment screen',
          type: 'bug',
          categoryId: 'payment',
          priority: 'high'
        },
        ratings: {
          overallExperience: 4,
          performance: 5,
          design: 5,
          easeOfUse: 4,
          reliability: 3
        },
        telemetry: {
          appVersion: 'v1.0.5',
          deviceModel: 'Desktop',
          browserName: 'Chrome',
          currentRoute: '/dashboard/wallet'
        }
      });

    expect([201, 200]).toContain(res.statusCode);
    expect(res.body.success).toBe(true);
  });

  it('should ingest automatic crash report', async () => {
    const res = await request(app)
      .post('/api/v1/feedback/crashes')
      .send({
        errorName: 'TypeError',
        errorMessage: 'Cannot read property of undefined',
        stackTrace: 'TypeError: Cannot read property...\n  at WalletPage (WalletPage.tsx:42)',
        route: '/dashboard/wallet'
      });

    expect([201, 200]).toContain(res.statusCode);
    expect(res.body.success).toBe(true);
  });
});
