import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import React, { useEffect, Suspense } from 'react';

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

// ─── Lazy-loaded pages (route-level code splitting) ───
// Public pages
const LandingPage = React.lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const Login = React.lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Signup = React.lazy(() => import('./pages/Signup').then(m => ({ default: m.Signup })));
const TermsPage = React.lazy(() => import('./pages/TermsPage').then(m => ({ default: m.TermsPage })));
const PrivacyPage = React.lazy(() => import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })));
const PaymentSuccess = React.lazy(() => import('./pages/PaymentSuccess').then(m => ({ default: m.PaymentSuccess })));
const PaymentCancel = React.lazy(() => import('./pages/PaymentCancel').then(m => ({ default: m.PaymentCancel })));

// Dashboard pages
const DashboardHome = React.lazy(() => import('./pages/dashboard/DashboardHome').then(m => ({ default: m.DashboardHome })));
const Notes = React.lazy(() => import('./pages/dashboard/Notes').then(m => ({ default: m.Notes })));
const Chat = React.lazy(() => import('./pages/dashboard/Chat').then(m => ({ default: m.Chat })));
const Shared = React.lazy(() => import('./pages/dashboard/Shared').then(m => ({ default: m.Shared })));
const Feed = React.lazy(() => import('./pages/dashboard/Feed').then(m => ({ default: m.Feed })));
const Search = React.lazy(() => import('./pages/dashboard/Search').then(m => ({ default: m.Search })));
const Settings = React.lazy(() => import('./pages/dashboard/Settings').then(m => ({ default: m.Settings })));
const Billing = React.lazy(() => import('./pages/dashboard/Billing').then(m => ({ default: m.Billing })));
const Affiliates = React.lazy(() => import('./pages/dashboard/Affiliates').then(m => ({ default: m.Affiliates })));
const Notifications = React.lazy(() => import('./pages/dashboard/Notifications').then(m => ({ default: m.Notifications })));
const Trends = React.lazy(() => import('./pages/dashboard/Trends').then(m => ({ default: m.Trends })));
const WalletPage = React.lazy(() => import('./pages/dashboard/WalletPage').then(m => ({ default: m.WalletPage })));
const TeamsPage = React.lazy(() => import('./pages/teams/TeamsPage').then(m => ({ default: m.TeamsPage })));

// Admin pages
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const UserManagement = React.lazy(() => import('./pages/admin/UserManagement').then(m => ({ default: m.UserManagement })));
const AdminChat = React.lazy(() => import('./pages/admin/AdminChat').then(m => ({ default: m.AdminChat })));
const AuditLogs = React.lazy(() => import('./pages/admin/AuditLogs').then(m => ({ default: m.AuditLogs })));
const BroadcastManager = React.lazy(() => import('./pages/admin/BroadcastManager').then(m => ({ default: m.BroadcastManager })));
const AutoReplySettings = React.lazy(() => import('./pages/admin/AutoReplySettings').then(m => ({ default: m.AutoReplySettings })));
const Analytics = React.lazy(() => import('./pages/admin/Analytics').then(m => ({ default: m.Analytics })));
const AdminSettings = React.lazy(() => import('./pages/admin/AdminSettings').then(m => ({ default: m.AdminSettings })));
const ManageAds = React.lazy(() => import('./pages/admin/ManageAds').then(m => ({ default: m.ManageAds })));

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

                    {/* Protected Routes */}
                    <Route element={<ProtectedRoute />}>
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
