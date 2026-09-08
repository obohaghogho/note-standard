/**
 * Global Touch & Navigation Cooldown Lock
 * Prevents ghost-click event penetration on mobile devices when hiding/showing
 * full-screen mobile overlays (e.g. Back button in ChatWindow hiding to reveal ConversationList).
 */
let lastNavigationTime = 0;
const COOLDOWN_MS = 450;

export const triggerNavigationLock = () => {
    lastNavigationTime = Date.now();
};

export const isNavigationLocked = (): boolean => {
    return Date.now() - lastNavigationTime < COOLDOWN_MS;
};
