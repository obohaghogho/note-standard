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
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    // No user = redirect to login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Role-based access: only check if allowedRoles is specified AND profile has loaded with a role
    // If profile hasn't loaded yet or role is undefined, allow access - the admin page will handle loading state
    if (allowedRoles && profile?.role && !allowedRoles.includes(profile.role)) {
        // User has a profile but doesn't have required role
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
};
