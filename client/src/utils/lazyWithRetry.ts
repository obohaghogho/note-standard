import React from 'react';

/**
 * A wrapper for React.lazy that automatically retries the import on failure.
 * This is particularly useful for handling "Failed to fetch dynamically imported module" errors
 * which occur when a new version of the app is deployed and old chunks are removed.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T } | T>,
  name?: string
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      const component = await componentImport();
      // If successful, reset the refresh flag
      window.sessionStorage.setItem('page-has-been-force-refreshed', 'false');
      
      // Handle the different return types of dynamic imports (m.default vs m)
      if (typeof component === 'object' && component !== null && 'default' in component) {
        return component as { default: T };
      }
      return { default: component } as { default: T };
    } catch (error) {
      console.error(`[LazyLoad] Error loading component ${name || 'unknown'}:`, error);

      // Check if we've already tried to refresh to resolve this
      const hasRefreshed = sessionStorage.getItem(`refreshed-${name}`) === 'true';

      if (!hasRefreshed) {
        sessionStorage.setItem(`refreshed-${name}`, 'true');
        console.warn(`[LazyLoad] Retrying ${name}...`);
        window.location.reload();
        return new Promise(() => {}); // Wait for reload
      }

      // If we already refreshed, clear the flag and propagate error
      sessionStorage.removeItem(`refreshed-${name}`);
      throw error;
    }
  });
}
