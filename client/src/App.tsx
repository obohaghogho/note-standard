import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useEffect, Suspense } from 'react';

// Layout & structural components (eagerly loaded — needed immediately)
import { DashboardLayout } from './components/layout/DashboardLayout';
import { AdminLayout } from './components/layout/AdminLayout';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ChatProvider } from './context/ChatContext';
import { NotificationProvider } from './context/NotificationContext';
import { WalletProvider } from './context/WalletContext';
import { WebRTCProvider } from './context/WebRTCContext';
import { PresenceProvider } from './context/PresenceContext';
import { NotesProvider } from './context/NotesContext';
import { ChatWidget } from './components/chat/ChatWidget';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { lazyWithRetry } from './utils/lazyWithRetry';

// ─── Lazy-loaded pages (route-level code splitting) ───
// Public pages

const LandingPage = lazyWithRetry(() => import('./pages/LandingPage').then(m => m.LandingPage), 'LandingPage');
const Login = lazyWithRetry(() => import('./pages/Login').then(m => m.Login), 'Login');
const Signup = lazyWithRetry(() => import('./pages/Signup').then(m => m.Signup), 'Signup');
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage').then(m => m.TermsPage), 'TermsPage');
const PrivacyPage = lazyWithRetry(() => import('./pages/PrivacyPage').then(m => m.PrivacyPage), 'PrivacyPage');
const RefundPage = lazyWithRetry(() => import('./pages/RefundPage').then(m => m.RefundPage), 'RefundPage');
const AboutPage = lazyWithRetry(() => import('./pages/AboutPage').then(m => m.AboutPage), 'AboutPage');
const ContactPage = lazyWithRetry(() => import('./pages/ContactPage').then(m => m.ContactPage), 'ContactPage');
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword').then(m => m.ResetPassword), 'ResetPassword');
const ActivitySuccess = lazyWithRetry(() => import('./pages/ActivitySuccess').then(m => m.ActivitySuccess), 'ActivitySuccess');
const ActivityCancel = lazyWithRetry(() => import('./pages/ActivityCancel').then(m => m.ActivityCancel), 'ActivityCancel');

// Dashboard pages
const DashboardHome = lazyWithRetry(() => import('./pages/dashboard/DashboardHome').then(m => m.DashboardHome), 'DashboardHome');
const Notes = lazyWithRetry(() => import('./pages/dashboard/Notes').then(m => m.Notes), 'Notes');
const Chat = lazyWithRetry(() => import('./pages/dashboard/Chat').then(m => m.Chat), 'Chat');
const Shared = lazyWithRetry(() => import('./pages/dashboard/Shared').then(m => m.Shared), 'Shared');
const Feed = lazyWithRetry(() => import('./pages/dashboard/Feed').then(m => m.Feed), 'Feed');
const Search = lazyWithRetry(() => import('./pages/dashboard/Search').then(m => m.Search), 'Search');
const Settings = lazyWithRetry(() => import('./pages/dashboard/Settings').then(m => m.Settings), 'Settings');
const Billing = lazyWithRetry(() => import('./pages/dashboard/Billing').then(m => m.Billing), 'Billing');
const Affiliates = lazyWithRetry(() => import('./pages/dashboard/Affiliates').then(m => m.Affiliates), 'Affiliates');
const Notifications = lazyWithRetry(() => import('./pages/dashboard/Notifications').then(m => m.Notifications), 'Notifications');
const Trends = lazyWithRetry(() => import('./pages/dashboard/Trends').then(m => m.Trends), 'Trends');
const WalletPage = lazyWithRetry(() => import('./pages/WalletPage').then(m => m.WalletPage), 'WalletPage');
const Transactions = lazyWithRetry(() => import('./pages/dashboard/Transactions').then(m => m.Transactions), 'Transactions');
const TeamsPage = lazyWithRetry(() => import('./pages/teams/TeamsPage').then(m => m.TeamsPage), 'TeamsPage');

// Admin pages
const AdminDashboard = lazyWithRetry(() => import('./pages/admin/AdminDashboard').then(m => m.AdminDashboard), 'AdminDashboard');
const UserManagement = lazyWithRetry(() => import('./pages/admin/UserManagement').then(m => m.UserManagement), 'UserManagement');
const AdminChat = lazyWithRetry(() => import('./pages/admin/AdminChat').then(m => m.AdminChat), 'AdminChat');
const AuditLogs = lazyWithRetry(() => import('./pages/admin/AuditLogs').then(m => m.AuditLogs), 'AuditLogs');
const BroadcastManager = lazyWithRetry(() => import('./pages/admin/BroadcastManager').then(m => m.BroadcastManager), 'BroadcastManager');
const AutoReplySettings = lazyWithRetry(() => import('./pages/admin/AutoReplySettings').then(m => m.AutoReplySettings), 'AutoReplySettings');
const Analytics = lazyWithRetry(() => import('./pages/admin/Analytics').then(m => m.Analytics), 'Analytics');
const AdminSettings = lazyWithRetry(() => import('./pages/admin/AdminSettings').then(m => m.AdminSettings), 'AdminSettings');
const ManageAds = lazyWithRetry(() => import('./pages/admin/ManageAds').then(m => m.ManageAds), 'ManageAds');
const LimitRequestsPage = lazyWithRetry(() => import('./pages/admin/LimitRequestsPage').then(m => m.LimitRequestsPage), 'LimitRequestsPage');
const DepositPage = lazyWithRetry(() => import('./pages/dashboard/DepositPage'), 'DepositPage');
const ManualDeposits = lazyWithRetry(() => import('./pages/admin/ManualDeposits').then(m => m.ManualDeposits), 'ManualDeposits');

const ChatRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/dashboard/chat?id=${id}`} replace />;
};

function App() {
  useEffect(() => {
    // Global error handler for uncaught errors
    const handleError = (event: ErrorEvent) => {
      console.error('Global error caught:', event.error);
      toast.error(`Error: ${event.error?.message || 'An unexpected error occurred'}`);
      event.preventDefault(); // Prevent default browser error handling
    };

    // Global handler for unhandled promise rejections
    const handler = (e: PromiseRejectionEvent) => {
      console.error('[Unhandled Promise]', e.reason);
      if (e.reason instanceof Error && e.reason.stack) {
        console.error('[Stack Trace]', e.reason.stack);
      }
    };

    // Global handler for online/offline status
    const handleOnline = () => {
      toast.success('Back online', { id: 'online-status' });
    };

    const handleOffline = () => {
      toast.error(
        () => (
          <span>
            <b>⚠️ No internet connection.</b>
            <br />
            Please check your network and try again.
          </span>
        ),
        { id: 'online-status', duration: Infinity }
      );
    };

    // Attach global error handlers
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handler);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check for offline state
    if (!navigator.onLine) {
      handleOffline();
    }

    // Cleanup on unmount
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handler);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      <ErrorBoundary>
        <Router>
            <AuthProvider>
            <SocketProvider>
            <PresenceProvider>
            <NotificationProvider>
                <ChatProvider>
                <WebRTCProvider>
                <WalletProvider>
                <NotesProvider>
                    <Suspense fallback={
                      <div className="flex items-center justify-center min-h-[100dvh] bg-[#0a0a0a]">
                        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                      </div>
                    }>
                    <Routes>
                    <Route path="/" element={<Suspense fallback={null}><LandingPage /></Suspense>} />
                    <Route path="/login" element={<Suspense fallback={null}><Login /></Suspense>} />
                    <Route path="/signup" element={<Suspense fallback={null}><Signup /></Suspense>} />
                    <Route path="/terms" element={<Suspense fallback={null}><TermsPage /></Suspense>} />
                    <Route path="/privacy" element={<Suspense fallback={null}><PrivacyPage /></Suspense>} />
                    <Route path="/refund" element={<Suspense fallback={null}><RefundPage /></Suspense>} />
                    <Route path="/about" element={<Suspense fallback={null}><AboutPage /></Suspense>} />
                    <Route path="/contact" element={<Suspense fallback={null}><ContactPage /></Suspense>} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    
                    {/* Legacy Chat Redirect */}
                    <Route path="/chat/:id" element={<ChatRedirect />} />

                    {/* Activity result pages - outside protected route as user returns from external service */}
                    <Route path="/activity/success" element={<Suspense fallback={<div>Loading...</div>}><ActivitySuccess /></Suspense>} />
                    <Route path="/activity/cancel" element={<Suspense fallback={<div>Loading...</div>}><ActivityCancel /></Suspense>} />
                    {/* Alias for activity path */}
                    <Route path="/activity" element={<Navigate to="/dashboard/activity" replace />} />

                    <Route element={<ProtectedRoute />}>
                        {/* User Dashboard */}
                        <Route path="/dashboard" element={
                            <ErrorBoundary fallback={<div>Something went wrong loading the dashboard. <button onClick={() => window.location.reload()}>Reload</button></div>}>
                                <DashboardLayout />
                            </ErrorBoundary>
                        }>
                        <Route index element={<DashboardHome />} />
                        <Route path="notes" element={<Notes />} />
                        <Route path="chat" element={<Chat />} />
                        <Route path="shared" element={<Shared />} />
                        <Route path="feed" element={<Feed />} />
                        <Route path="favorites" element={<Notes />} />
                        <Route path="search" element={<Search />} />
                        <Route path="billing" element={<Billing />} />
                        <Route path="activity" element={<WalletPage />} />
                        <Route path="history" element={<Transactions />} />
                        <Route path="affiliates" element={<Affiliates />} />
                        <Route path="deposit" element={<DepositPage />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="notifications" element={<Notifications />} />
                        <Route path="trends" element={<Trends />} />
                        <Route path="teams" element={<TeamsPage />} />
                        </Route>
                    </Route>

                    {/* Admin Routes - Restrict to admin/support roles */}
                    <Route element={<ProtectedRoute allowedRoles={['admin', 'support']} />}>
                        <Route path="/admin" element={
                            <ErrorBoundary fallback={<div>Admin Error</div>}>
                                <AdminLayout />
                            </ErrorBoundary>
                        }>
                        <Route index element={<Suspense fallback={null}><AdminDashboard /></Suspense>} />
                        <Route path="users" element={<Suspense fallback={null}><UserManagement /></Suspense>} />
                        <Route path="chats" element={<Suspense fallback={null}><AdminChat /></Suspense>} />
                        <Route path="audit-logs" element={<Suspense fallback={null}><AuditLogs /></Suspense>} />
                        <Route path="broadcasts" element={<Suspense fallback={null}><BroadcastManager /></Suspense>} />
                        <Route path="auto-reply" element={<Suspense fallback={null}><AutoReplySettings /></Suspense>} />
                        <Route path="analytics" element={<Suspense fallback={null}><Analytics /></Suspense>} />
                        <Route path="ads" element={<Suspense fallback={null}><ManageAds /></Suspense>} />
                        <Route path="deposits" element={<Suspense fallback={null}><ManualDeposits /></Suspense>} />
                        <Route path="limit-requests" element={<Suspense fallback={null}><LimitRequestsPage /></Suspense>} />
                        <Route path="settings" element={<Suspense fallback={null}><AdminSettings /></Suspense>} />
                        </Route>
                    </Route>
                    </Routes>
                    </Suspense>
                    
                    <ChatWidget />
                </NotesProvider>
                </WalletProvider>
                </WebRTCProvider>
                </ChatProvider>
            </NotificationProvider>
            </PresenceProvider>
            </SocketProvider>
            </AuthProvider>
        </Router>
      </ErrorBoundary>
    </>
  );
}

export default App;
