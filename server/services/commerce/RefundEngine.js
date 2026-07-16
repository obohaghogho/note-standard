const supabase = require('../../config/database');
const entitlementService = require('./EntitlementService');

class RefundEngine {
  
  /**
   * Centralized refund processor.
   * Handles the webhook, updates purchase state, revokes entitlements, 
   * and triggers analytics recalculation.
   */
  async processRefund(providerTxId, reason = 'Customer requested refund') {
    // 1. Locate the purchase
    const { data: purchase, error: pError } = await supabase
      .from('commerce_purchases')
      .select('*')
      .eq('provider_tx_id', providerTxId)
      .single();

    if (pError || !purchase) {
      throw new Error(`Cannot process refund: Purchase not found for TX ${providerTxId}`);
    }

    if (purchase.status === 'refunded') {
      return { status: 'already_refunded', purchase };
    }

    // 2. Start a transaction (via RPC or sequential awaits for simplicity here)
    
    // Update purchase status
    await supabase
      .from('commerce_purchases')
      .update({ status: 'refunded', updated_at: new Date().toISOString() })
      .eq('id', purchase.id);

    // Record the refund event
    await supabase
      .from('commerce_refunds')
      .insert({
        purchase_id: purchase.id,
        amount: purchase.amount_paid,
        reason: reason
      });

    // 3. Revoke Entitlements (resolves bundles automatically)
    await entitlementService.revokeAccess(purchase.user_id, purchase.product_id, reason);

    // 4. Update Commerce Analytics (Product Health)
    // Decrement total_revenue and increment refund_count
    await supabase.rpc('increment_product_refund', {
      p_product_id: purchase.product_id,
      p_refund_amount: purchase.amount_paid
    });

    // 5. Future: Adjust Creator Revenue balance
    // await payoutService.deductRefundFromBalance(purchase.creator_id, purchase.amount_paid);

    return { status: 'refund_processed', purchaseId: purchase.id };
  }
}

module.exports = new RefundEngine();
