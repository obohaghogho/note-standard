// ============================================================================
// Risk Engine Service
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RiskAssessment } from '@/types';
import { RiskDecision, RiskSeverity } from '@/types';

export class RiskEngineService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Assess risk for a deposit operation.
   * Returns a decision (allow/flag/block) with score and reasons.
   */
  async assessDeposit(
    userId: string,
    amount: number,
    currency: string,
  ): Promise<RiskAssessment> {
    const reasons: string[] = [];
    let score = 0;

    // 1. Check velocity — too many transactions in short window
    const { count: recentCount } = await this.supabase
      .from('provider_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

    if ((recentCount ?? 0) > 5) {
      score += 40;
      reasons.push(`High velocity: ${recentCount} transactions in 30 minutes`);
    } else if ((recentCount ?? 0) > 3) {
      score += 20;
      reasons.push(`Moderate velocity: ${recentCount} transactions in 30 minutes`);
    }

    // 2. Check amount against limits
    const { data: limits } = await this.supabase
      .from('tier_limits')
      .select('limit_type, max_amount')
      .eq('currency', currency);

    if (limits) {
      const singleLimit = limits.find(l => l.limit_type === 'single_deposit');
      if (singleLimit?.max_amount && amount > singleLimit.max_amount) {
        score += 50;
        reasons.push(`Amount ${amount} exceeds single deposit limit ${singleLimit.max_amount}`);
      }
    }

    // 3. Check account age
    const { data: userData } = await this.supabase.auth.admin.getUserById(userId);
    if (userData?.user) {
      const accountAgeHours =
        (Date.now() - new Date(userData.user.created_at).getTime()) / (1000 * 60 * 60);
      if (accountAgeHours < 24 && amount > 5000000) {
        score += 30;
        reasons.push('New account with high deposit amount');
      }
    }

    // 4. Determine decision
    let decision: RiskDecision;
    if (score >= 80) {
      decision = RiskDecision.BLOCK;
    } else if (score >= 40) {
      decision = RiskDecision.FLAG;
    } else {
      decision = RiskDecision.ALLOW;
    }

    // 5. Log risk event
    if (score > 0) {
      const severity: RiskSeverity = score >= 80 ? RiskSeverity.CRITICAL : score >= 40 ? RiskSeverity.HIGH : RiskSeverity.MEDIUM;
      await this.supabase.from('risk_events').insert({
        user_id: userId,
        event_type: 'deposit_assessment',
        severity,
        decision,
        reason: reasons.join('; '),
        metadata: { amount, currency, score },
      });
    }

    return { decision, score, reasons };
  }

  /**
   * Assess risk for a withdrawal operation.
   */
  async assessWithdrawal(
    userId: string,
    amount: number,
    currency: string,
  ): Promise<RiskAssessment> {
    const reasons: string[] = [];
    let score = 0;

    // Check total daily withdrawals
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todayWithdrawals } = await this.supabase
      .from('withdrawal_requests')
      .select('amount')
      .eq('user_id', userId)
      .neq('status', 'rejected')
      .neq('status', 'failed')
      .gte('created_at', today.toISOString());

    const totalToday = (todayWithdrawals || []).reduce(
      (sum, w) => sum + (w.amount as number), 0
    );

    if (totalToday + amount > 20000000) {
      score += 40;
      reasons.push(`Daily withdrawal volume high: ${totalToday + amount} kobo`);
    }

    // Check if it's first withdrawal (higher risk)
    const { count } = await this.supabase
      .from('withdrawal_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed');

    if ((count ?? 0) === 0) {
      score += 15;
      reasons.push('First withdrawal for this account');
    }

    const decision: RiskDecision = score >= 80 ? RiskDecision.BLOCK : score >= 40 ? RiskDecision.FLAG : RiskDecision.ALLOW;

    if (score > 0) {
      await this.supabase.from('risk_events').insert({
        user_id: userId,
        event_type: 'withdrawal_assessment',
        severity: score >= 80 ? RiskSeverity.CRITICAL : score >= 40 ? RiskSeverity.HIGH : RiskSeverity.MEDIUM,
        decision,
        reason: reasons.join('; '),
        metadata: { amount, currency, score },
      });
    }

    return { decision, score, reasons };
  }
}
