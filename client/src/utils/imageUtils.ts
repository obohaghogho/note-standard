export const FALLBACK_IMAGES = {
    DEFAULT: 'https://ui-avatars.com/api/?name=Image&background=random',
    PROFILE: 'https://ui-avatars.com/api/?name=User&background=random',
    BANNER: 'https://placehold.co/600x400/1e293b/cbd5e1?text=Image+Unavailable',
    CARD: 'https://placehold.co/400x300/1e293b/cbd5e1?text=No+Image',
    HERO: 'https://placehold.co/1200x600/1e293b/cbd5e1?text=Image+Unavailable'
};

export const getFallbackImage = (type?: 'profile' | 'banner' | 'card' | 'hero' | 'default') => {
    switch (type) {
        case 'profile': return FALLBACK_IMAGES.PROFILE;
        case 'banner': return FALLBACK_IMAGES.BANNER;
        case 'card': return FALLBACK_IMAGES.CARD;
        case 'hero': return FALLBACK_IMAGES.HERO;
        default: return FALLBACK_IMAGES.DEFAULT;
    }
};

export const isValidImageSrc = (src?: string | null): boolean => {
    if (!src) return false;
    if (src.trim() === '') return false;
    // Add more validation if needed (e.g. check for known bad domains)
    return true;
};
