import React from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

interface UserBadgeProps {
  planTier?: 'free' | 'pro' | 'team' | 'business' | 'enterprise';
  isVerified?: boolean;
  size?: number;
  className?: string;
  showText?: boolean;
}

export const UserBadge: React.FC<UserBadgeProps> = ({
  planTier,
  isVerified,
  size = 14,
  className = "",
  showText = false
}) => {
  // Authoritative verification: verified users get the blue tick
  if (isVerified) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`} title="Verified User">
        <CheckCircle2 
          size={size} 
          className="text-blue-500 fill-blue-500/10 flex-shrink-0" 
        />
        {showText && <span className="text-xs font-medium text-blue-400">Verified</span>}
      </div>
    );
  }

  // Plan subscribers without verification get a plan indicator badge (ShieldCheck)
  const isSubscribed = planTier && ['pro', 'team', 'business', 'enterprise'].includes(planTier);
  if (isSubscribed) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`} title={`${planTier?.charAt(0).toUpperCase()}${planTier?.slice(1)} Plan`}>
        <ShieldCheck 
          size={size} 
          className="text-blue-400 flex-shrink-0" 
        />
        {showText && <span className="text-xs font-medium text-blue-400/80">{planTier?.charAt(0).toUpperCase()}${planTier?.slice(1)}</span>}
      </div>
    );
  }

  return null;
};

export default UserBadge;
