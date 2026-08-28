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

  // Admin Routes
  '/admin': () => import('../pages/admin/AdminDashboard'),
  '/admin/users': () => import('../pages/admin/UserManagement'),
  '/admin/kyc-compliance': () => import('../pages/admin/KycCompliancePage'),
  '/admin/chats': () => import('../pages/admin/AdminChat'),
  '/admin/audit-logs': () => import('../pages/admin/AuditLogs'),
  '/admin/reconciliation': () => import('../pages/admin/ReconciliationDashboard').then(m => ({ default: m.ReconciliationDashboard })),
  '/admin/ads': () => import('../pages/admin/ManageAds'),
  '/admin/deposits': () => import('../pages/admin/ManualDeposits'),
  '/admin/withdrawals': () => import('../pages/admin/ManualWithdrawals'),
  '/admin/limit-requests': () => import('../pages/admin/LimitRequestsPage'),
  '/admin/settings': () => import('../pages/admin/AdminSettings'),
  '/admin/push-health': () => import('../pages/admin/PushHealthDashboard'),
  '/admin/communication-health': () => import('../pages/admin/CommunicationHealthDashboard').then(m => ({ default: m.CommunicationHealthDashboard })),
  '/admin/fincra': () => import('../components/admin/FincraAdminPanel').then(m => ({ default: m.FincraAdminPanel })),
  '/admin/crypto-treasury': () => import('../pages/admin/CryptoTreasuryDashboard'),
  '/admin/broadcasts': () => import('../pages/admin/BroadcastManager'),
  '/admin/auto-reply': () => import('../pages/admin/AutoReplySettings'),
  '/admin/analytics': () => import('../pages/admin/Analytics'),
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

/**
 * Background prefetch core admin panel feature chunks during idle time
 */
export function preloadCoreAdminRoutes(): void {
  const adminRoutes = [
    '/admin/users',
    '/admin/chats',
    '/admin/crypto-treasury',
    '/admin/ads',
    '/admin/audit-logs',
    '/admin/reconciliation',
    '/admin/push-health',
  ];

  const runPreload = () => {
    adminRoutes.forEach((route) => {
      preloadRoute(route);
    });
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(runPreload, { timeout: 2500 });
  } else {
    setTimeout(runPreload, 500);
  }
}
