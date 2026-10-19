import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { VerifiedBadge } from './VerifiedBadge';

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
  // Authoritative verification: verified users get the Instagram-style blue seal
  if (isVerified) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`}>
        <VerifiedBadge size={size} showTooltip={!showText} />
        {showText && <span className="text-xs font-medium text-blue-400">Verified</span>}
      </div>
    );
  }

  // Plan subscribers without verification get a distinct plan indicator badge (ShieldCheck in indigo)
  const normalizedTier = planTier ? planTier.toLowerCase() : '';
  const isSubscribed = ['pro', 'team', 'business', 'enterprise'].includes(normalizedTier);
  if (isSubscribed) {
    const formattedTier = normalizedTier.charAt(0).toUpperCase() + normalizedTier.slice(1);
    return (
      <div
        className={`inline-flex items-center gap-1 ${className}`}
        title={`${formattedTier} Subscriber`}
        role="img"
        aria-label={`${formattedTier} Subscriber`}
      >
        <ShieldCheck
          size={size}
          className="text-indigo-400 flex-shrink-0"
        />
        {showText && <span className="text-xs font-medium text-indigo-400/90">{formattedTier}</span>}
      </div>
    );
  }

  return null;
};

export default UserBadge;
