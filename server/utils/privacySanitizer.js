/**
 * Privacy Sanitizer Utility — NoteStandard
 *
 * Enforces server-side privacy rules for user profile objects.
 * Location fields (country_code, city, location, latitude, longitude, address) are
 * strictly stripped if the target user's location_visibility setting is 'hidden'
 * (or unconfigured/default hidden), unless the requesting viewer is the profile owner.
 */

const LOCATION_FIELDS = ['country_code', 'city', 'location', 'latitude', 'longitude', 'address', 'user_location', 'coordinates'];

/**
 * Sanitizes a profile object for a requesting viewer based on the target user's privacy settings.
 *
 * @param {Object} profile - Target profile object from DB
 * @param {string|null} requestingUserId - ID of the user requesting the profile
 * @returns {Object} Sanitized profile object
 */
function sanitizeProfileForViewer(profile, requestingUserId) {
  if (!profile || typeof profile !== 'object') return profile;

  const isOwner = requestingUserId && String(requestingUserId) === String(profile.id);
  const sanitized = { ...profile };

  // If the viewer is the profile owner, return full data
  if (isOwner) {
    return sanitized;
  }

  // Location Privacy Enforcement
  const locationVisibility = profile.location_visibility || 'hidden';

  if (locationVisibility === 'hidden') {
    // Strip all location-identifying fields
    for (const field of LOCATION_FIELDS) {
      delete sanitized[field];
    }
  } else if (locationVisibility === 'visible') {
    // Under 'visible', retain coarse location (e.g. country_code) but ensure precise GPS coordinates are stripped
    delete sanitized.latitude;
    delete sanitized.longitude;
    delete sanitized.coordinates;
  }

  return sanitized;
}

/**
 * Sanitizes an array of profile objects for a requesting viewer.
 *
 * @param {Array<Object>} profiles - Array of target profile objects
 * @param {string|null} requestingUserId - ID of the user requesting the profiles
 * @returns {Array<Object>} Array of sanitized profile objects
 */
function sanitizeProfilesForViewer(profiles, requestingUserId) {
  if (!Array.isArray(profiles)) return profiles;
  return profiles.map(p => sanitizeProfileForViewer(p, requestingUserId));
}

module.exports = {
  sanitizeProfileForViewer,
  sanitizeProfilesForViewer,
  LOCATION_FIELDS
};
