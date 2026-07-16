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
  // Business plan users get the blue tick
  if (planTier === 'business') {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`} title="Business Plan">
        <CheckCircle2 
          size={size} 
          className="text-blue-500 fill-blue-500/10 flex-shrink-0" 
        />
        {showText && <span className="text-xs font-medium text-blue-400">Business</span>}
      </div>
    );
  }

  // Other subscribers get a different badge (ShieldCheck)
  const isSubscribed = planTier && ['pro', 'team', 'enterprise'].includes(planTier);
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

  // Fallback for manually verified users who aren't on business plan
  if (isVerified) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`} title="Verified User">
        <CheckCircle2 
          size={size} 
          className="text-gray-400 flex-shrink-0" 
        />
      </div>
    );
  }

  return null;
};

export default UserBadge;
