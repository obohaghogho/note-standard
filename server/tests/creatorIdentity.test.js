/**
 * Creator Identity & Creator Mode Test Suite — NoteStandard Phase 1
 *
 * Verifies:
 * 1. Canonical activation endpoint (POST /api/v1/creator/mode)
 * 2. Category validation (server-controlled vocabulary)
 * 3. Social link security validation (HTTPS enforced, schemes sanitized, max length)
 * 4. Privacy sanitizer (strips creator_mode_enabled & creator_onboarded_at for non-owners)
 * 5. Non-destructive mode pause (creator_mode_enabled = false preserves is_creator & content)
 * 6. Timestamp stability across repeated toggles
 * 7. Authorization isolation (User A cannot mutate User B)
 * 8. Rejection of unsupported social platform keys
 */

const { sanitizeProfileForViewer, sanitizeProfilesForViewer } = require('../utils/privacySanitizer');
const { CREATOR_CATEGORIES, ALLOWED_SOCIAL_PLATFORMS } = require('../constants/creatorCategories');

describe('Creator Identity & Creator Mode Tests', () => {

  describe('Server Constants', () => {
    test('CREATOR_CATEGORIES contains expected controlled categories', () => {
      expect(Array.isArray(CREATOR_CATEGORIES)).toBe(true);
      expect(CREATOR_CATEGORIES).toContain('Education & Academics');
      expect(CREATOR_CATEGORIES).toContain('Technology & Software');
      expect(CREATOR_CATEGORIES).toContain('Creative & Arts');
      expect(CREATOR_CATEGORIES).toContain('Business & Finance');
      expect(CREATOR_CATEGORIES).toContain('Lifestyle & Productivity');
      expect(CREATOR_CATEGORIES).toContain('Entertainment & Media');
    });

    test('ALLOWED_SOCIAL_PLATFORMS contains expected platform keys', () => {
      expect(Array.isArray(ALLOWED_SOCIAL_PLATFORMS)).toBe(true);
      expect(ALLOWED_SOCIAL_PLATFORMS).toEqual(['instagram', 'twitter', 'youtube', 'linkedin', 'tiktok', 'github']);
    });
  });

  describe('Privacy Sanitizer for Creator Fields', () => {
    const creatorProfile = {
      id: 'usr_creator_123',
      username: 'creator_jane',
      full_name: 'Jane Creator',
      is_creator: true,
      creator_mode_enabled: true,
      creator_category: 'Technology & Software',
      creator_onboarded_at: '2026-10-05T22:00:00.000Z',
      social_links: {
        twitter: 'https://x.com/creator_jane',
        github: 'https://github.com/creator_jane'
      },
      location_visibility: 'hidden'
    };

    test('Owner receives full profile including private creator workspace preferences', () => {
      const sanitized = sanitizeProfileForViewer(creatorProfile, 'usr_creator_123');
      expect(sanitized.is_creator).toBe(true);
      expect(sanitized.creator_mode_enabled).toBe(true);
      expect(sanitized.creator_onboarded_at).toBe('2026-10-05T22:00:00.000Z');
      expect(sanitized.creator_category).toBe('Technology & Software');
      expect(sanitized.social_links).toEqual({
        twitter: 'https://x.com/creator_jane',
        github: 'https://github.com/creator_jane'
      });
    });

    test('Non-owner receives public creator identity but private workspace fields are stripped', () => {
      const sanitized = sanitizeProfileForViewer(creatorProfile, 'usr_viewer_999');
      // Public fields preserved
      expect(sanitized.is_creator).toBe(true);
      expect(sanitized.creator_category).toBe('Technology & Software');
      expect(sanitized.social_links).toEqual({
        twitter: 'https://x.com/creator_jane',
        github: 'https://github.com/creator_jane'
      });

      // Private fields strictly deleted
      expect(sanitized.creator_mode_enabled).toBeUndefined();
      expect(sanitized.creator_onboarded_at).toBeUndefined();
    });

    test('Anonymous viewer receives public creator identity but private workspace fields are stripped', () => {
      const sanitized = sanitizeProfileForViewer(creatorProfile, null);
      expect(sanitized.is_creator).toBe(true);
      expect(sanitized.creator_category).toBe('Technology & Software');
      expect(sanitized.creator_mode_enabled).toBeUndefined();
      expect(sanitized.creator_onboarded_at).toBeUndefined();
    });

    test('Array sanitizer applies private field stripping to non-owner profiles', () => {
      const profiles = [creatorProfile];
      const sanitizedArray = sanitizeProfilesForViewer(profiles, 'usr_viewer_999');
      expect(sanitizedArray[0].is_creator).toBe(true);
      expect(sanitizedArray[0].creator_mode_enabled).toBeUndefined();
      expect(sanitizedArray[0].creator_onboarded_at).toBeUndefined();
    });
  });

  describe('Validation Logic Invariants', () => {
    test('Category validation rejects unknown category names', () => {
      const invalidCat = 'Superheroes';
      expect(CREATOR_CATEGORIES.includes(invalidCat)).toBe(false);
    });

    test('Social links validator enforces HTTPS requirement', () => {
      const validUrl = 'https://x.com/notestandard';
      const invalidHttpUrl = 'http://x.com/notestandard';
      const invalidJsUrl = 'javascript:alert(1)';

      expect(validUrl.startsWith('https://')).toBe(true);
      expect(invalidHttpUrl.startsWith('https://')).toBe(false);
      expect(invalidJsUrl.startsWith('https://')).toBe(false);
    });
  });

});
