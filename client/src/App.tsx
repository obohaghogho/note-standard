import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useEffect } from 'react';
import { LandingPage } from './pages/LandingPage';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ResetPassword } from './pages/ResetPassword';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { DashboardHome } from './pages/dashboard/DashboardHome';
import { Notes } from './pages/dashboard/Notes';
import { Chat } from './pages/dashboard/Chat';
import { Shared } from './pages/dashboard/Shared';
import { Feed } from './pages/dashboard/Feed';
import { Search } from './pages/dashboard/Search';
import { Settings } from './pages/dashboard/Settings';
import { Billing } from './pages/dashboard/Billing';
import { Affiliates } from './pages/dashboard/Affiliates';

const ChatRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/dashboard/chat?id=${id}`} replace />;
};

import { Notifications } from './pages/dashboard/Notifications';
import { Trends } from './pages/dashboard/Trends';
import { TeamsPage } from './pages/teams/TeamsPage';

// Admin imports
import { AdminLayout } from './components/layout/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { UserManagement } from './pages/admin/UserManagement';
import { AdminChat } from './pages/admin/AdminChat';
import { AuditLogs } from './pages/admin/AuditLogs';
import { BroadcastManager } from './pages/admin/BroadcastManager';
import { AutoReplySettings } from './pages/admin/AutoReplySettings';
import { Analytics } from './pages/admin/Analytics';
import { AdminSettings } from './pages/admin/AdminSettings';
import { ManageAds } from './pages/admin/ManageAds';

import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

import { ChatProvider } from './context/ChatContext';
import { NotificationProvider } from './context/NotificationContext';
import { WalletProvider } from './context/WalletContext';
import { WalletPage } from './pages/dashboard/WalletPage';
import { WebRTCProvider } from './context/WebRTCContext';
import { PresenceProvider } from './context/PresenceContext';

// Payment pages
import { PaymentSuccess } from './pages/PaymentSuccess';
import { PaymentCancel } from './pages/PaymentCancel';

// Chat Widget for user support
import { ChatWidget } from './components/chat/ChatWidget';

// Error Boundary
import { ErrorBoundary } from './components/common/ErrorBoundary';

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
      </ErrorBoundary>

    </>
  );
}

export default App;
