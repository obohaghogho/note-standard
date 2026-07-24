// Intelligent Route Preloader for Instant Dashboard Feature Navigation

const preloadedRoutes = new Set<string>();

const routeImports: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('../pages/dashboard/DashboardHome'),
  '/dashboard/notes': () => import('../pages/dashboard/Notes'),
  '/dashboard/chat': () => import('../pages/dashboard/Chat'),
  '/dashboard/shared': () => import('../pages/dashboard/Shared'),
  '/dashboard/feed': () => import('../pages/dashboard/Feed'),
  '/dashboard/trends': () => import('../pages/dashboard/Trends'),
  '/dashboard/search': () => import('../pages/dashboard/Search'),
  '/dashboard/teams': () => import('../pages/teams/TeamsPage'),
  '/dashboard/wallet': () => import('../pages/WalletPage'),
  '/dashboard/history': () => import('../pages/dashboard/Transactions'),
  '/dashboard/affiliates': () => import('../pages/dashboard/Affiliates'),
  '/dashboard/notifications': () => import('../pages/dashboard/Notifications'),
  '/dashboard/billing': () => import('../pages/dashboard/Billing'),
  '/dashboard/settings': () => import('../pages/dashboard/Settings'),
};

/**
 * Preload a route bundle chunk on hover or focus
 */
export function preloadRoute(path: string): void {
  const cleanPath = path.split('?')[0].split('#')[0];
  if (preloadedRoutes.has(cleanPath)) return;

  const importer = routeImports[cleanPath];
  if (importer) {
    preloadedRoutes.add(cleanPath);
    importer().catch((err) => {
      console.warn(`[RoutePreloader] Preload non-blocking note for ${cleanPath}:`, err);
    });
  }
}

/**
 * Background prefetch core dashboard feature chunks during browser idle time
 */
export function preloadCoreDashboardRoutes(): void {
  const coreRoutes = [
    '/dashboard/notes',
    '/dashboard/chat',
    '/dashboard/teams',
    '/dashboard/wallet',
    '/dashboard/settings',
    '/dashboard/trends',
    '/dashboard/notifications',
  ];

  const runPreload = () => {
    coreRoutes.forEach((route) => {
      preloadRoute(route);
    });
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(runPreload, { timeout: 2000 });
  } else {
    setTimeout(runPreload, 300);
  }
}
