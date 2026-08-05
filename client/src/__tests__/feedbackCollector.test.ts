import { sanitizeSensitiveData, collectTelemetry } from '../utils/feedbackCollector';
import { runFullAIAssist, calculateSemanticSimilarity } from '../utils/aiFeedbackAssistant';

describe('Feedback Collector & AI Assistant Tests', () => {
  it('should redact Bearer JWT tokens and passwords', () => {
    const raw = 'Auth token Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature and password "secret123"';
    const clean = sanitizeSensitiveData(raw);

    expect(clean).not.toContain('eyJhbGciOiJIUzI1Ni');
    expect(clean).not.toContain('secret123');
    expect(clean).toContain('[REDACTED_JWT]');
    expect(clean).toContain('[REDACTED]');
  });

  it('should calculate semantic similarity correctly', () => {
    const text1 = 'Transfer failed after PIN confirmation';
    const text2 = 'PIN transfer failure when confirming';
    const score = calculateSemanticSimilarity(text1, text2);

    expect(score).toBeGreaterThan(0.3);
  });

  it('should generate concise AI title and category suggestion', () => {
    const desc = 'I tried to deposit money with my debit card but the payment gateway timed out.';
    const result = runFullAIAssist(desc);

    expect(result.suggestedCategory).toBe('payment');
    expect(result.suggestedTitle).toBeTruthy();
    expect(result.estimatedPriority).toBe('high');
  });
});
