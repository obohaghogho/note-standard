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
// import { ChatWidget } from './components/chat/ChatWidget'; // already handled by Route
import { ChatWidget } from './components/chat/ChatWidget';
import { ErrorBoundary } from 'react-error-boundary';
import { VersionGuard } from './components/common/VersionGuard';
import DashboardHome from './pages/dashboard/DashboardHome';
import Notes from './pages/dashboard/Notes';
import Chat from './pages/dashboard/Chat';
import Shared from './pages/dashboard/Shared';
import Feed from './pages/dashboard/Feed';
import Search from './pages/dashboard/Search';
import Settings from './pages/dashboard/Settings';
import Billing from './pages/dashboard/Billing';
import Affiliates from './pages/dashboard/Affiliates';
import Notifications from './pages/dashboard/Notifications';
import Trends from './pages/dashboard/Trends';
import WalletPage from './pages/WalletPage';
import Transactions from './pages/dashboard/Transactions';
import TeamsPage from './pages/teams/TeamsPage';
import DepositPage from './pages/dashboard/DepositPage';
import DownloadPage from './pages/dashboard/DownloadPage';
import { lazyWithRetry } from './utils/lazyWithRetry';

// ─── Lazy-loaded pages (route-level code splitting) ───
// Public pages
const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'), 'LandingPage');
const Login = lazyWithRetry(() => import('./pages/Login'), 'Login');
const Signup = lazyWithRetry(() => import('./pages/Signup'), 'Signup');
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage'), 'TermsPage');
const PrivacyPage = lazyWithRetry(() => import('./pages/PrivacyPage'), 'PrivacyPage');
const RefundPage = lazyWithRetry(() => import('./pages/RefundPage'), 'RefundPage');
const AboutPage = lazyWithRetry(() => import('./pages/AboutPage'), 'AboutPage');
const ContactPage = lazyWithRetry(() => import('./pages/ContactPage'), 'ContactPage');
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'), 'ResetPassword');
const ActivitySuccess = lazyWithRetry(() => import('./pages/ActivitySuccess'), 'ActivitySuccess');
const ActivityCancel = lazyWithRetry(() => import('./pages/ActivityCancel'), 'ActivityCancel');

// Dashboard pages are now static for performance and reliability

const AdminDashboard = lazyWithRetry(() => import('./pages/admin/AdminDashboard'), 'AdminDashboard');
const UserManagement = lazyWithRetry(() => import('./pages/admin/UserManagement'), 'UserManagement');
const AdminChat = lazyWithRetry(() => import('./pages/admin/AdminChat'), 'AdminChat');
const AuditLogs = lazyWithRetry(() => import('./pages/admin/AuditLogs'), 'AuditLogs');
const BroadcastManager = lazyWithRetry(() => import('./pages/admin/BroadcastManager'), 'BroadcastManager');
const AutoReplySettings = lazyWithRetry(() => import('./pages/admin/AutoReplySettings'), 'AutoReplySettings');
const Analytics = lazyWithRetry(() => import('./pages/admin/Analytics'), 'Analytics');
const AdminSettings = lazyWithRetry(() => import('./pages/admin/AdminSettings'), 'AdminSettings');
const ManageAds = lazyWithRetry(() => import('./pages/admin/ManageAds'), 'ManageAds');
const LimitRequestsPage = lazyWithRetry(() => import('./pages/admin/LimitRequestsPage'), 'LimitRequestsPage');
const ManualDeposits = lazyWithRetry(() => import('./pages/admin/ManualDeposits'), 'ManualDeposits');

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
    <Router>
      <ErrorBoundary 
        fallback={
          <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Something went wrong</h2>
            <p style={{ marginTop: '0.5rem', color: '#9ca3af' }}>Please refresh the page to continue.</p>
            <button 
              onClick={() => window.location.reload()}
              style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}
            >
              Reload Page
            </button>
          </div>
        }
      >
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#0a0a0a' }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        }>
          <AuthProvider>
            <VersionGuard>
            <SocketProvider>
              <PresenceProvider>
                <NotificationProvider>
                  <ChatProvider>
                    <WebRTCProvider>
                      <WalletProvider>
                        <NotesProvider>
                          <Routes>
                            <Route path="/" element={<LandingPage />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/signup" element={<Signup />} />
                            <Route path="/terms" element={<TermsPage />} />
                            <Route path="/privacy" element={<PrivacyPage />} />
                            <Route path="/refund" element={<RefundPage />} />
                            <Route path="/about" element={<AboutPage />} />
                            <Route path="/contact" element={<ContactPage />} />
                            <Route path="/reset-password" element={<ResetPassword />} />
                            <Route path="/download" element={<DownloadPage />} />
                            
                            <Route path="/chat/:id" element={<ChatRedirect />} />

                            <Route path="/activity/success" element={<ActivitySuccess />} />
                            <Route path="/activity/cancel" element={<ActivityCancel />} />
                            <Route path="/activity" element={<Navigate to="/dashboard/activity" replace />} />

                            <Route element={<ProtectedRoute />}>
                              <Route path="/dashboard" element={<DashboardLayout />}>
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
                                {/* Download page is now at /download */}
                              </Route>
                            </Route>

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
                                <Route path="deposits" element={<ManualDeposits />} />
                                <Route path="limit-requests" element={<LimitRequestsPage />} />
                                <Route path="settings" element={<AdminSettings />} />
                              </Route>
                            </Route>
                          </Routes>
                          {/* Global Chat Widget - visible on all authenticated pages */}
                          <ChatWidget />
                        </NotesProvider>
                      </WalletProvider>
                    </WebRTCProvider>
                  </ChatProvider>
                </NotificationProvider>
              </PresenceProvider>
            </SocketProvider>
            </VersionGuard>
          </AuthProvider>
        </Suspense>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
