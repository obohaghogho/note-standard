import type { FeedbackReport } from '../types/feedback';

export interface ImpactScoreResult {
  score: number; // 0 to 100
  urgencyBand: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
}

export function calculateUserImpactScore(
  report: Partial<FeedbackReport>,
  affectedUserCount: number = 1
): ImpactScoreResult {
  let score = 10;
  const factors: string[] = [];

  // 1. Category multiplier
  if (report.categoryId === 'security') {
    score += 40;
    factors.push('Security Vulnerability (+40)');
  } else if (report.categoryId === 'payment' || report.categoryId === 'wallet') {
    score += 35;
    factors.push('Financial Transaction Impact (+35)');
  } else if (report.categoryId === 'performance') {
    score += 20;
    factors.push('System Performance Degradation (+20)');
  }

  // 2. Affected user scaling
  if (affectedUserCount > 100) {
    score += 25;
    factors.push('Widespread Impact >100 Users (+25)');
  } else if (affectedUserCount > 10) {
    score += 15;
    factors.push('Moderate Impact >10 Users (+15)');
  }

  // 3. Crash severity
  if (report.type === 'crash' || report.priority === 'critical') {
    score += 25;
    factors.push('Application Crash / Critical Priority (+25)');
  }

  const finalScore = Math.min(100, score);
  let urgencyBand: ImpactScoreResult['urgencyBand'] = 'low';
  if (finalScore >= 80) urgencyBand = 'critical';
  else if (finalScore >= 60) urgencyBand = 'high';
  else if (finalScore >= 35) urgencyBand = 'medium';

  return {
    score: finalScore,
    urgencyBand,
    factors,
  };
}

export interface RegressionCheckResult {
  isRegression: boolean;
  previouslyFixedInVersion?: string;
  matchedReportId?: string;
  matchedTitle?: string;
}

export function detectRegression(
  newReport: Partial<FeedbackReport>,
  historicalResolvedReports: FeedbackReport[]
): RegressionCheckResult {
  if (!newReport.title || !newReport.description) {
    return { isRegression: false };
  }

  const titleLower = newReport.title.toLowerCase();

  for (const prev of historicalResolvedReports) {
    if (prev.status === 'resolved' || prev.status === 'closed') {
      const prevTitleLower = prev.title.toLowerCase();
      if (
        titleLower.includes(prevTitleLower) ||
        prevTitleLower.includes(titleLower) ||
        (newReport.categoryId === prev.categoryId && titleLower === prevTitleLower)
      ) {
        return {
          isRegression: true,
          previouslyFixedInVersion: prev.fixedInVersion || prev.introducedInVersion || 'v1.0.4',
          matchedReportId: prev.id,
          matchedTitle: prev.title,
        };
      }
    }
  }

  return { isRegression: false };
}
