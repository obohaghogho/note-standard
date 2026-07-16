import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
    allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
    const { user, profile, authReady } = useAuth();
    console.log("[ProtectedRoute] Status:", { authReady, user: !!user, profileRole: profile?.role });

    // Rule 8: If auth is not ready, show loader
    if (!authReady) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-background w-full max-w-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Rule 8: If no user, redirect to login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Check allowed roles
    if (allowedRoles && profile?.role && !allowedRoles.includes(profile.role)) {
        console.warn("[ProtectedRoute] Unauthorized access attempt:", { user: user.id, role: profile.role, required: allowedRoles });
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
};
