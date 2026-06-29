const supabase = require('../../config/database');

class EntitlementService {
  
  /**
   * Check if a user has access to a specific Knowledge Node.
   * Resolves through products, bundles, and preview policies.
   */
  async checkAccess(userId, nodeId, nodeType) {
    // 1. Direct entitlement to the product containing the node
    const { data: directAccess } = await supabase.rpc('check_node_entitlement', {
      p_user_id: userId,
      p_node_id: nodeId,
      p_node_type: nodeType
    });
    
    if (directAccess) return { hasAccess: true, accessType: 'purchased' };
    
    // 2. Check if the node is allowed via a preview policy
    const { data: previewPolicy } = await supabase
      .from('commerce_preview_policies')
      .select('product_id')
      .contains('allowed_node_ids', [nodeId])
      .limit(1)
      .maybeSingle();

    if (previewPolicy) {
      // Create a temporary/in-memory preview entitlement context
      return { hasAccess: true, accessType: 'preview' };
    }

    return { hasAccess: false, accessType: 'locked' };
  }

  /**
   * Grant access to a product (and resolve bundles).
   */
  async grantAccess(userId, productId, accessType = 'purchased', options = {}) {
    const { validUntil, orgId, seatCount } = options;
    
    // Check if product is a bundle
    const { data: bundleItems } = await supabase
      .from('commerce_product_bundles')
      .select('included_product_id')
      .eq('bundle_product_id', productId);
      
    const productIdsToGrant = bundleItems?.length 
      ? [productId, ...bundleItems.map(b => b.included_product_id)]
      : [productId];

    const entitlements = productIdsToGrant.map(pid => ({
      user_id: userId,
      product_id: pid,
      access_type: accessType,
      valid_until: validUntil || null,
      org_id: orgId || null,
      seat_count: seatCount || 1,
      status: 'active'
    }));

    const { data, error } = await supabase
      .from('commerce_entitlements')
      .upsert(entitlements, { onConflict: 'user_id,product_id' })
      .select();
      
    if (error) throw error;
    return data;
  }

  /**
   * Revoke access (used by RefundEngine or subscription expiry).
   */
  async revokeAccess(userId, productId, reason = 'Refunded') {
    // Also revoke bundled items if the parent bundle is revoked
    const { data: bundleItems } = await supabase
      .from('commerce_product_bundles')
      .select('included_product_id')
      .eq('bundle_product_id', productId);
      
    const productIdsToRevoke = bundleItems?.length 
      ? [productId, ...bundleItems.map(b => b.included_product_id)]
      : [productId];

    const { error } = await supabase
      .from('commerce_entitlements')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoke_reason: reason
      })
      .in('product_id', productIdsToRevoke)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  }
}

module.exports = new EntitlementService();
