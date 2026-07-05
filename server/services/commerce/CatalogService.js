const supabase = require('../../config/database');

class CatalogService {

  /**
   * Publish a new product to the catalog.
   * Enforces Revenue Readiness score threshold.
   */
  async publishProduct(creatorId, productData, includedNodeIds = [], bundledProductIds = []) {
    // 1. Verify Revenue Readiness
    const { data: readiness } = await supabase
      .from('creator_revenue_readiness')
      .select('overall_score, is_monetization_eligible')
      .eq('creator_id', creatorId)
      .maybeSingle();

    if (!readiness || !readiness.is_monetization_eligible) {
      throw new Error(`Creator is not monetization eligible. Current score: ${readiness?.overall_score || 0}. Required: 70.`);
    }

    // 2. Create the product
    const { data: product, error } = await supabase
      .from('commerce_products')
      .insert({
        creator_id: creatorId,
        space_id: productData.spaceId,
        title: productData.title,
        description: productData.description,
        product_type: productData.productType,
        price_amount: productData.priceAmount,
        currency: productData.currency || 'USD',
        pricing_model: productData.pricingModel || 'one_time',
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;

    // 3. Link Knowledge Nodes (for standard products)
    if (includedNodeIds.length > 0) {
      const nodeLinks = includedNodeIds.map(n => ({
        product_id: product.id,
        node_id: n.id,
        node_type: n.type
      }));
      await supabase.from('commerce_product_nodes').insert(nodeLinks);
    }

    // 4. Link Bundled Products (for bundles)
    if (bundledProductIds.length > 0) {
      const bundleLinks = bundledProductIds.map(bpId => ({
        bundle_product_id: product.id,
        included_product_id: bpId
      }));
      await supabase.from('commerce_product_bundles').insert(bundleLinks);
    }

    // 5. Initialize Product Health metrics
    await supabase.from('commerce_product_health').insert({ product_id: product.id });

    return product;
  }

  /**
   * Set the preview policy for a product.
   */
  async setPreviewPolicy(productId, allowedNodeIds, timeLimitMinutes = null) {
    const { data, error } = await supabase
      .from('commerce_preview_policies')
      .upsert({
        product_id: productId,
        allowed_node_ids: allowedNodeIds,
        time_limit_minutes: timeLimitMinutes
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Discover marketplace products ranked by educational signals.
   */
  async discoverProducts({ limit = 20, productType = null }) {
    let query = supabase
      .from('commerce_products')
      .select(`
        *,
        creator:profiles(full_name, username),
        health:commerce_product_health(
          total_sales, avg_completion_pct, avg_rating, refund_rate_pct
        )
      `)
      .eq('status', 'active');

    if (productType) {
      query = query.eq('product_type', productType);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Rank products dynamically based on Discovery formula
    // (High completion + high sales - high refunds)
    const ranked = data.map(p => {
      const health = p.health || {};
      const salesScore = Math.min((health.total_sales || 0) / 100, 1);
      const completionScore = (health.avg_completion_pct || 0) / 100;
      const refundPenalty = (health.refund_rate_pct || 0) / 100;
      const ratingScore = (health.avg_rating || 0) / 5;
      
      const discoveryScore = (salesScore * 0.3) + (completionScore * 0.4) + (ratingScore * 0.4) - (refundPenalty * 1.0);
      
      return { ...p, discoveryScore };
    });

    return ranked.sort((a, b) => b.discoveryScore - a.discoveryScore).slice(0, limit);
  }
}

module.exports = new CatalogService();
