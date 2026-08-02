'use strict';

/**
 * RBACService.js
 * =============
 * Role-Based Access Control (RBAC) & Privilege Verification Service.
 */
class RBACService {
  constructor(options = {}) {
    try {
      this.db = options.db || require('../../config/database');
    } catch (e) {
      this.db = options.db || null;
    }

    this.rolePermissions = new Map([
      ['BANKING_ADMIN', ['TREASURY_REBALANCE_WRITE', 'FEATURE_FLAG_WRITE', 'COMPLIANCE_AUDIT_READ']],
      ['TREASURY_OFFICER', ['TREASURY_READ', 'TREASURY_REBALANCE_WRITE']],
      ['AUDITOR', ['COMPLIANCE_AUDIT_READ']]
    ]);
  }

  /**
   * Check if role has required permission
   */
  async hasPermission(role, permissionKey) {
    if (!role || !permissionKey) return false;
    const perms = this.rolePermissions.get(role) || [];
    return perms.includes(permissionKey);
  }

  /**
   * Assert role permission or throw access denied
   */
  async assertPermission(role, permissionKey) {
    const allowed = await this.hasPermission(role, permissionKey);
    if (!allowed) {
      throw new Error(`ACCESS_DENIED: Role '${role}' lacks permission '${permissionKey}'.`);
    }
  }
}

module.exports = RBACService;
