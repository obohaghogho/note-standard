import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, ShieldCheck, MapPin, Globe, Calendar, Star, Camera } from 'lucide-react';
import SecureImage from '../common/SecureImage';
import type { PublicProfile } from './PublicProfileModal';
import toast from 'react-hot-toast';

interface ProfileHeaderProps {
  profile: PublicProfile;
  isOwner: boolean;
  completionPercentage?: number;
}

const getBadges = (profile: PublicProfile) => {
  const badges = [];
  if (profile.is_verified) badges.push({ icon: <CheckCircle size={20} className="text-blue-400" />, label: 'Verified' });
  if (profile.kyc_level === 'premium') badges.push({ icon: <Star size={20} className="text-yellow-400" />, label: 'Premium' });
  if (profile.kyc_level === 'admin') badges.push({ icon: <ShieldCheck size={20} className="text-red-400" />, label: 'Admin' });
  return badges;
};

const getInitials = (name?: string, username?: string) => {
  if (name) return name.charAt(0).toUpperCase();
  if (username) return username.charAt(0).toUpperCase();
  return '?';
};

const getAvatarColor = (name: string) => {
  const colors = [
    'from-pink-500 to-rose-500',
    'from-purple-500 to-indigo-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-red-500 to-pink-500'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const getCountryName = (code: string) => {
  try {
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase());
  } catch (e) {
    return code.toUpperCase();
  }
};

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({ profile, isOwner }) => {
  const badges = getBadges(profile);
  const avatarBg = useMemo(() => getAvatarColor(profile.username || 'user'), [profile.username]);
  
  const handleEditClick = (type: 'avatar' | 'banner') => {
    toast.error(`Editing ${type} will be available in the next update. Head to settings for now!`);
  };

  return (
    <div className="relative flex flex-col w-full bg-gray-950">
      {/* Cover Banner */}
      <div className="relative h-44 sm:h-56 md:h-64 min-h-[160px] w-full bg-gradient-to-br from-indigo-950 via-purple-950 to-gray-950 group">
        {profile.cover_url ? (
          <SecureImage src={profile.cover_url} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 opacity-70 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-600/40 via-purple-600/30 to-gray-950" />
        )}
        
        {isOwner && (
          <button 
            onClick={() => handleEditClick('banner')}
            className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity border border-white/20 shadow-lg z-20"
          >
            <Camera size={14} /> Edit Cover
          </button>
        )}

        {/* Avatar Anchored inside Cover Banner */}
        <div className="absolute -bottom-14 sm:-bottom-18 left-4 sm:left-8 z-20">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 200, damping: 20 }}
            className="relative group shrink-0"
          >
            <div className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full border-[5px] border-gray-950 bg-gradient-to-br ${avatarBg} overflow-hidden shadow-2xl flex items-center justify-center text-4xl sm:text-5xl font-black text-white relative`}>
              {profile.avatar_url ? (
                <SecureImage src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
              ) : (
                <span>{getInitials(profile.full_name, profile.username)}</span>
              )}
              
              {isOwner && (
                <button 
                  onClick={() => handleEditClick('avatar')}
                  className="absolute inset-0 bg-black/50 hover:bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera size={24} className="text-white" />
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Profile Info Summary with top padding for avatar space */}
      <div className="px-4 sm:px-8 pt-16 sm:pt-20 pb-4 flex flex-col gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex flex-wrap items-center gap-2 tracking-tight leading-tight break-words">
            {profile.full_name || profile.username}
            {badges.map((badge, idx) => (
              <span key={idx} title={badge.label} className="mt-0.5 flex items-center shrink-0">
                {badge.icon}
              </span>
            ))}
          </h1>
          <p className="text-gray-400 text-sm sm:text-base font-medium mt-0.5">@{profile.username}</p>
        </div>

        {/* Bio Section */}
        {profile.bio && (
          <p className="text-gray-200 text-sm sm:text-base leading-relaxed max-w-2xl whitespace-pre-wrap break-words">
            {profile.bio}
          </p>
        )}

        {/* Metadata Details */}
        <div className="flex flex-wrap gap-y-2 gap-x-4 text-xs sm:text-sm text-gray-400 mt-1 items-center">
          {(profile.plan_tier === 'pro' || profile.kyc_level === 'premium' || profile.kyc_level === 'admin') && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-white/5 rounded-full border border-white/10 text-white font-bold shrink-0 text-xs">
              ⭐ Creator
            </div>
          )}
          
          {profile.country_code && (
            <div className="flex items-center gap-1.5 shrink-0">
              <MapPin size={14} className="text-gray-500" />
              <span>{getCountryName(profile.country_code)}</span>
            </div>
          )}
          {profile.website && (
            <div className="flex items-center gap-1.5 shrink-0 min-w-0">
              <Globe size={14} className="text-gray-500 shrink-0" />
              <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
          {profile.created_at && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Calendar size={14} className="text-gray-500" />
              <span>Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
