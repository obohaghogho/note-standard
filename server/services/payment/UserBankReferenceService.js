'use strict';

/**
 * UserBankReferenceService.js
 * ===========================
 * Manages persistent, unique bank deposit references per user & provider.
 * Guarantees that each user has a single permanent reference (e.g. NS-9X2AB71)
 * tied to Grey Lead Bank transfers so saved bank memo transfers always match cleanly.
 */

const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const crypto = require('crypto');

class UserBankReferenceService {
  constructor() {
    this.fallbackMemoryStore = new Map();
  }

  /**
   * Generate a random 7-character alphanumeric string formatted as NS-XXXXXXX.
   * Example: NS-9X2AB71
   */
  generateCode(currency = null) {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    const bytes = crypto.randomBytes(7);
    for (let i = 0; i < 7; i++) {
      code += chars[bytes[i] % chars.length];
    }
    const prefix = currency ? `NS-${String(currency).toUpperCase()}-` : 'NS-';
    return `${prefix}${code}`;
  }

  /**
   * Retrieve the permanent active reference for a user & provider.
   * If none exists, creates and persists a new permanent reference.
   * 
   * @param {string} userId
   * @param {string} provider Default: 'grey'
   * @returns {Promise<string>} e.g. "NS-9X2AB71"
   */
  async getOrCreateUserReference(userId, provider = 'grey') {
    if (!userId) {
      return 'NS-DEMO999';
    }

    const prov = String(provider).toLowerCase();

    try {
      // 1. Check for existing active reference in user_bank_references
      const { data: existing, error } = await supabase
        .from('user_bank_references')
        .select('reference')
        .eq('user_id', userId)
        .eq('provider', prov)
        .eq('is_active', true)
        .maybeSingle();

      if (!error && existing && existing.reference) {
        return existing.reference;
      }

      // 2. Fallback check: check if reference was previously saved in profiles or metadata
      const { data: profile } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('id', userId)
        .maybeSingle();

      if (profile && profile.metadata && profile.metadata.bank_reference) {
        const savedRef = profile.metadata.bank_reference;
        // Backfill into user_bank_references
        try {
          await supabase.from('user_bank_references').insert({
            user_id: userId,
            provider: prov,
            reference: savedRef,
            is_active: true
          });
        } catch (e) {}

        return savedRef;
      }

      // 3. Generate a new permanent reference with uniqueness retry loop
      let newRef = this.generateCode();
      let attempts = 0;

      while (attempts < 5) {
        const { error: insertError } = await supabase
          .from('user_bank_references')
          .insert({
            user_id: userId,
            provider: prov,
            reference: newRef,
            is_active: true
          });

        if (!insertError) {
          logger.info(`[UserBankReferenceService] Created permanent reference '${newRef}' for user ${userId}`);
          return newRef;
        }

        // If duplicate key error, try next code
        if (insertError.code === '23505') {
          newRef = this.generateCode();
          attempts++;
        } else {
          logger.warn(`[UserBankReferenceService] DB insert warning (${insertError.message}), using deterministically hashed fallback`);
          break;
        }
      }

      // Fallback in-memory store if DB table is unavailable or offline
      const storeKey = `${userId}:${prov}`;
      if (this.fallbackMemoryStore.has(storeKey)) {
        return this.fallbackMemoryStore.get(storeKey);
      }

      const hash = crypto.createHash('md5').update(`${userId}-${prov}`).digest('hex').substring(0, 7).toUpperCase();
      const prefix = prov === 'fincra' ? 'NS-NGN-' : 'NS-';
      const fallbackRef = `${prefix}${hash}`;
      this.fallbackMemoryStore.set(storeKey, fallbackRef);
      return fallbackRef;
    } catch (err) {
      logger.error(`[UserBankReferenceService] Error fetching/creating reference: ${err.message}`);
      const storeKey = `${userId}:${prov}`;
      if (this.fallbackMemoryStore.has(storeKey)) {
        return this.fallbackMemoryStore.get(storeKey);
      }
      const hash = crypto.createHash('md5').update(`${userId}-${prov}`).digest('hex').substring(0, 7).toUpperCase();
      const prefix = prov === 'fincra' ? 'NS-NGN-' : 'NS-';
      const fallbackRef = `${prefix}${hash}`;
      this.fallbackMemoryStore.set(storeKey, fallbackRef);
      return fallbackRef;
    }
  }

  /**
   * Admin / Explicit User Action: Regenerate a user's reference string
   * Deactivates previous reference and issues a new active code.
   */
  async regenerateUserReference(userId, provider = 'grey') {
    const prov = String(provider).toLowerCase();
    const storeKey = `${userId}:${prov}`;

    // Deactivate previous active references
    try {
      await supabase
        .from('user_bank_references')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('provider', prov);
    } catch (e) {
      logger.warn(`[UserBankReferenceService] Deactivate previous reference warning: ${e.message}`);
    }

    const newRef = this.generateCode();
    try {
      await supabase
        .from('user_bank_references')
        .insert({
          user_id: userId,
          provider: prov,
          reference: newRef,
          is_active: true
        });
    } catch (e) {
      logger.warn(`[UserBankReferenceService] Insert regenerated reference warning: ${e.message}`);
    }

    this.fallbackMemoryStore.set(storeKey, newRef);

    logger.info(`[UserBankReferenceService] Regenerated reference to '${newRef}' for user ${userId}`);
    return newRef;
  }
}

module.exports = new UserBankReferenceService();
