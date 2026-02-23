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
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('page-has-been-force-refreshed') || 'false'
    );

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
      console.error(`Error loading lazy component ${name || ''}:`, error);

      if (!pageHasAlreadyBeenForceRefreshed) {
        // Log that we're forcing a refresh
        console.warn('ChunkLoadError detected, forcing page refresh to get latest version.');
        window.sessionStorage.setItem('page-has-been-force-refreshed', 'true');
        window.location.reload();
        
        // Return a promise that never resolves while the page is reloading
        return new Promise(() => {});
      }

      // If we already refreshed and it still fails, throw the error
      throw error;
    }
  });
}
