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

    // Account activation check: restrict access if email is not confirmed
    if (!user?.email_confirmed_at) {
        // If not confirmed, we can either redirect to a special message page 
        // or just stay on login with a message.
        // For now, let's redirect to login if they somehow bypass it.
        return <Navigate to="/login" replace />;
    }

    // Role-based access
    if (allowedRoles && profile?.role && !allowedRoles.includes(profile.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
};
