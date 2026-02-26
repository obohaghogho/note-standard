import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
    allowedRoles?: string[];
}

export const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
    const { user, profile, authReady } = useAuth();

    // Wait until auth state is fully resolved before making redirect decisions
    if (!authReady) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-background w-full max-w-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    // No user = redirect to login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Account activation check: restrict access if account is not verified
    // Exceptions: Allow access to the /complete-verification page itself
    const isVerifying = window.location.pathname === '/complete-verification';
    if (!profile?.is_verified && !isVerifying) {
        return <Navigate to="/complete-verification" replace />;
    }

    // Role-based access
    if (allowedRoles && profile?.role && !allowedRoles.includes(profile.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
};
