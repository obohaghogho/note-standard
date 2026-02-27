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
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword').then(m => m.ResetPassword), 'ResetPassword');
const PaymentSuccess = lazyWithRetry(() => import('./pages/PaymentSuccess').then(m => m.PaymentSuccess), 'PaymentSuccess');
const PaymentCancel = lazyWithRetry(() => import('./pages/PaymentCancel').then(m => m.PaymentCancel), 'PaymentCancel');
const Verify = lazyWithRetry(() => import('./pages/Verify').then(m => m.Verify), 'Verify');
const CompleteVerification = lazyWithRetry(() => import('./pages/CompleteVerification'), 'CompleteVerification');

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
const WalletPage = lazyWithRetry(() => import('./pages/dashboard/WalletPage').then(m => m.WalletPage), 'WalletPage');
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
    };

    // Global handler for online/offline status
    const handleOnline = () => {
      toast.success('Back online', { id: 'online-status' });
    };

    const handleOffline = () => {
      toast.error(
        (_t) => (
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
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#0a0a0a' }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        }>
        <Router>
            <AuthProvider>
            <SocketProvider>
            <PresenceProvider>
            <NotificationProvider>
                <ChatProvider>
                <WebRTCProvider>
                <WalletProvider>
                    <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/verify" element={<Verify />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    
                    {/* Legacy Chat Redirect */}
                    <Route path="/chat/:id" element={<ChatRedirect />} />

                    {/* Payment result pages - outside protected route as user returns from Stripe */}
                    <Route path="/payment/success" element={<PaymentSuccess />} />
                    <Route path="/payment/cancel" element={<PaymentCancel />} />
                    {/* Alias for wallet path */}
                    <Route path="/wallet" element={<WalletPage />} />

                    <Route element={<ProtectedRoute />}>
                        <Route path="/complete-verification" element={<CompleteVerification />} />
                        {/* User Dashboard */}
                        <Route path="/dashboard" element={<DashboardLayout />}>
                        <Route index element={<DashboardHome />} />
                        <Route path="notes" element={<Notes />} />
                        <Route path="chat" element={<Chat />} />
                        <Route path="shared" element={<Shared />} />
                        <Route path="feed" element={<Feed />} />
                        <Route path="favorites" element={<Notes />} />
                        <Route path="search" element={<Search />} />
                        <Route path="billing" element={<Billing />} />
                        <Route path="wallet" element={<WalletPage />} />
                        <Route path="transactions" element={<Transactions />} />
                        <Route path="affiliates" element={<Affiliates />} />
                        <Route path="settings" element={<Settings />} />

                        <Route path="notifications" element={<Notifications />} />
                        <Route path="trends" element={<Trends />} />
                        <Route path="teams" element={<TeamsPage />} />
                        </Route>
                    </Route>

                    {/* Admin Routes - Restrict to admin/support roles */}
                    <Route element={<ProtectedRoute allowedRoles={['admin', 'support']} />}>
                        <Route path="/admin" element={<AdminLayout />}>
                        <Route index element={<AdminDashboard />} />
                        <Route path="users" element={<UserManagement />} />
                        <Route path="chats" element={<AdminChat />} />
                        <Route path="audit-logs" element={<AuditLogs />} />
                        <Route path="broadcasts" element={<BroadcastManager />} />
                        <Route path="auto-reply" element={<AutoReplySettings />} />
                        <Route path="analytics" element={<Analytics />} />
                        <Route path="ads" element={<ManageAds />} />
                        <Route path="settings" element={<AdminSettings />} />
                        </Route>
                    </Route>
                    </Routes>

                    {/* Global Chat Widget - visible on all authenticated pages */}
                    <ChatWidget />
                </WalletProvider>
                </WebRTCProvider>
                </ChatProvider>
            </NotificationProvider>
            </PresenceProvider>
            </SocketProvider>
            </AuthProvider>
        </Router>
        </Suspense>
      </ErrorBoundary>

    </>
  );
}

export default App;
