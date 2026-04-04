import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
    allowedRoles?: string[];
}

export const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
    const { user, profile, authReady } = useAuth();
    console.log("[ProtectedRoute] Status:", { authReady, user: !!user, path: window.location.pathname });

    // Wait until auth state is fully resolved before making redirect decisions
    if (!authReady) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-background w-full max-w-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Role-based access
    if (allowedRoles && profile?.role && !allowedRoles.includes(profile.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
};
