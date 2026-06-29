/**
 * Ranking Service
 * Handles the calculation of post scores based on velocity, engagement, and exponential time decay.
 */

const DECAY_CONSTANT = 0.5; // Controls how fast older posts lose score
const GRAVITY = 1.8; // Hacker News style gravity

class RankingService {
  
  /**
   * Calculates the trending score for a post
   * Score = (Engagement Points) / (Age in Hours + 2)^Gravity
   */
  calculateScore(post) {
    const ageHours = this._getAgeInHours(post.created_at);
    
    // Weights
    const likesWeight = 1;
    const commentsWeight = 2;
    const sharesWeight = 3;
    const savesWeight = 4;
    
    // Base engagement points
    const basePoints = 
      ((post.likes_count || 0) * likesWeight) +
      ((post.comments_count || 0) * commentsWeight) +
      ((post.shares_count || 0) * sharesWeight) +
      ((post.saves_count || 0) * savesWeight);
      
    // Creator reputation boost (Future: pull from Creator API)
    const creatorReputationMultiplier = post.profiles?.is_verified ? 1.2 : 1.0;
    
    // Final numerator
    const engagementScore = basePoints * creatorReputationMultiplier;
    
    // Denominator (Time Decay)
    const timePenalty = Math.pow(ageHours + 2, GRAVITY);
    
    const finalScore = engagementScore / timePenalty;
    
    return finalScore;
  }

  _getAgeInHours(createdAt) {
    const now = new Date();
    const created = new Date(createdAt);
    return Math.max(0, (now - created) / (1000 * 60 * 60));
  }
  
  /**
   * Generates a composite cursor string: RankScore_Timestamp_PostID
   */
  generateCursor(score, timestamp, postId) {
    // Pad score to ensure string sorting works correctly for descending order
    // In practice, this requires careful encoding. Base64 is cleaner.
    const payload = `${score.toFixed(6)}_${new Date(timestamp).getTime()}_${postId}`;
    return Buffer.from(payload).toString('base64');
  }

  parseCursor(cursorStr) {
    if (!cursorStr) return null;
    try {
      const decoded = Buffer.from(cursorStr, 'base64').toString('ascii');
      const [score, timestampStr, postId] = decoded.split('_');
      return {
        score: parseFloat(score),
        timestamp: new Date(parseInt(timestampStr)).toISOString(),
        postId
      };
    } catch (e) {
      console.error('[RankingService] Invalid cursor:', cursorStr);
      return null;
    }
  }
}

module.exports = new RankingService();
