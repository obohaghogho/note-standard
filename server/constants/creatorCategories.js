/**
 * Creator Categories and Social Platforms — NoteStandard
 * Server-authoritative constants for Phase 1 Creator Identity validation.
 */

const CREATOR_CATEGORIES = Object.freeze([
  'Education & Academics',
  'Technology & Software',
  'Creative & Arts',
  'Business & Finance',
  'Lifestyle & Productivity',
  'Entertainment & Media'
]);

const ALLOWED_SOCIAL_PLATFORMS = Object.freeze([
  'instagram',
  'twitter',
  'youtube',
  'linkedin',
  'tiktok',
  'github'
]);

module.exports = {
  CREATOR_CATEGORIES,
  ALLOWED_SOCIAL_PLATFORMS
};
