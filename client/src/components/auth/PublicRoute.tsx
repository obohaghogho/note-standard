import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface PublicRouteProps {
  children: React.ReactNode;
}

export const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  const { user, authReady } = useAuth();

  // 1. While authentication is being restored, display boot loading state.
  // Prevents premature rendering of public landing/login DOM before session is resolved.
  if (!authReady) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-black w-full">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  // 2. If user is already authenticated, bypass public onboarding/auth pages
  // and route directly to homepage (/dashboard). Zero public DOM flash.
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  // 3. Unauthenticated guest -> render public onboarding/auth page
  return <>{children}</>;
};

export default PublicRoute;
