const supabase = require('../../config/database');

// ============================================================
// EdgeService
// Handles creating, updating, and resolving edges.
// ============================================================
class EdgeService {

  /**
   * Create a deterministic edge (Confidence 1.0 — structural truth).
   * Safe to call repeatedly; uses UPSERT under the hood.
   */
  async createDeterministic({ sourceId, sourceType, targetId, targetType, edgeType }) {
    const { error } = await supabase.rpc('upsert_deterministic_edge', {
      p_source_id: sourceId,
      p_source_type: sourceType,
      p_target_id: targetId,
      p_target_type: targetType,
      p_edge_type: edgeType
    });
    if (error) throw error;
  }

  /**
   * Record a behavioral edge (co-viewed, co-saved).
   * Increments confidence each time behavior is reinforced.
   */
  async recordBehavioral({ sourceId, sourceType, targetId, targetType, edgeType }) {
    // First, try to fetch the existing behavioral edge
    const { data: existing } = await supabase
      .from('knowledge_edges')
      .select('id, confidence')
      .eq('source_id', sourceId).eq('source_type', sourceType)
      .eq('target_id', targetId).eq('target_type', targetType)
      .eq('edge_type', edgeType)
      .maybeSingle();

    if (existing) {
      // Increase confidence, capping at 0.95 (behavioral never reaches 1.0)
      const newConfidence = Math.min(0.95, existing.confidence + 0.01);
      await supabase.from('knowledge_edges').update({ confidence: newConfidence, updated_at: new Date() }).eq('id', existing.id);
    } else {
      await supabase.from('knowledge_edges').insert({
        source_id: sourceId, source_type: sourceType,
        target_id: targetId, target_type: targetType,
        edge_type: edgeType,
        confidence: 0.30,
        status: 'inferred',
        created_by_layer: 'behavioral'
      });
    }
  }

  /**
   * Create an AI-inferred edge (pending moderator approval).
   */
  async createAiInferred({ sourceId, sourceType, targetId, targetType, edgeType, confidence, reason }) {
    await supabase.from('knowledge_edges').insert({
      source_id: sourceId, source_type: sourceType,
      target_id: targetId, target_type: targetType,
      edge_type: edgeType,
      confidence: confidence ?? 0.5,
      status: 'pending',
      reason,
      created_by_layer: 'ai'
    });
  }

  /**
   * Get all edges adjacent to a node (either as source or target).
   */
  async getAdjacentEdges({ nodeId, nodeType, minConfidence = 0.3, limit = 20 }) {
    const { data, error } = await supabase
      .from('knowledge_edges')
      .select('*')
      .or(`and(source_id.eq.${nodeId},source_type.eq.${nodeType}),and(target_id.eq.${nodeId},target_type.eq.${nodeType})`)
      .in('status', ['verified', 'inferred'])
      .gte('confidence', minConfidence)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }
}

// ============================================================
// TraversalService
// Multi-hop graph traversal using PostgreSQL recursive queries.
// ============================================================
class TraversalService {
  /**
   * Traverse the graph from a starting node up to N hops away.
   * Returns all reachable nodes in descending confidence order.
   */
  async traverse({ startId, startType, maxHops = 2, minConfidence = 0.4 }) {
    const { data, error } = await supabase.rpc('traverse_knowledge_graph', {
      p_start_id: startId,
      p_start_type: startType,
      p_max_hops: maxHops,
      p_min_confidence: minConfidence
    });

    if (error) {
      // Graceful fallback if RPC not yet deployed — return direct neighbors only
      console.warn('[TraversalService] Recursive CTE RPC not available, using fallback');
      const edgeSvc = new EdgeService();
      return edgeSvc.getAdjacentEdges({ nodeId: startId, nodeType: startType, minConfidence });
    }

    return data;
  }
}

// ============================================================
// RecommendationGraph
// Higher-level recommendations built on top of traversal.
// ============================================================
class RecommendationGraph {

  constructor() {
    this.traversal = new TraversalService();
    this.edges = new EdgeService();
  }

  /**
   * Return the most relevant nodes for display as "Related Content"
   * adjacent to a given Post or Wiki page.
   */
  async getRelatedContent({ nodeId, nodeType, limit = 6 }) {
    const nodes = await this.traversal.traverse({ startId: nodeId, startType: nodeType, maxHops: 2 });
    return (nodes || []).slice(0, limit);
  }

  /**
   * Build the enriched context payload for the AI assistant.
   * Returns a structured object that the AI prompt builder consumes.
   */
  async buildAiContext({ spaceId, query }) {
    // Fetch all nodes belonging to this space
    const { data: spaceEdges } = await supabase
      .from('knowledge_edges')
      .select('*')
      .eq('target_id', spaceId)
      .eq('target_type', 'space')
      .in('status', ['verified', 'inferred'])
      .order('confidence', { ascending: false })
      .limit(30);

    return {
      totalEdges: spaceEdges?.length ?? 0,
      topNodes: spaceEdges?.slice(0, 10) ?? [],
      query
    };
  }
}

// ============================================================
// GraphService — Public Facade
// All other services interact with this; never access sub-services directly.
// ============================================================
class GraphService {
  constructor() {
    this.edges = new EdgeService();
    this.traversal = new TraversalService();
    this.recommendation = new RecommendationGraph();
  }

  // Delegate methods (thin passthrough to keep callsites clean)
  createDeterministicEdge(params) { return this.edges.createDeterministic(params); }
  recordBehavioralEdge(params) { return this.edges.recordBehavioral(params); }
  createAiEdge(params) { return this.edges.createAiInferred(params); }
  getAdjacentEdges(params) { return this.edges.getAdjacentEdges(params); }
  traverse(params) { return this.traversal.traverse(params); }
  getRelatedContent(params) { return this.recommendation.getRelatedContent(params); }
  buildAiContext(params) { return this.recommendation.buildAiContext(params); }
}

// Singleton instance — one graph service for the entire process
module.exports = new GraphService();
