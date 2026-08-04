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
    const name = regionNames.of(code.toUpperCase());
    
    // Quick emoji map for common ones, or use a library, but let's stick to name + code
    return name;
  } catch (e) {
    return code.toUpperCase();
  }
};

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({ profile, isOwner, completionPercentage = 0 }) => {
  const badges = getBadges(profile);
  const avatarBg = useMemo(() => getAvatarColor(profile.username || 'user'), [profile.username]);
  
  const handleEditClick = (type: 'avatar' | 'banner') => {
    toast.error(`Editing ${type} will be available in the next update. Head to settings for now!`);
  };

  return (
    <div className="relative flex flex-col w-full bg-gray-950">
      {/* Banner */}
      <div className="relative h-56 sm:h-64 md:h-72 w-full bg-gradient-to-br from-indigo-900 via-purple-900 to-gray-900 overflow-hidden group">
        {profile.cover_url ? (
          <SecureImage src={profile.cover_url} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 opacity-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-600/30 via-purple-600/20 to-transparent" />
        )}
        
        {isOwner && (
          <button 
            onClick={() => handleEditClick('banner')}
            className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity border border-white/20 shadow-lg"
          >
            <Camera size={16} /> Edit Cover
          </button>
        )}
      </div>

      {/* Avatar & Info Container */}
      <div className="px-4 sm:px-8 pb-8 -mt-20 sm:-mt-24 relative z-10 flex flex-col sm:flex-row gap-4 items-start sm:items-end justify-between">
        {/* Avatar */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
          className="relative group"
        >
          <div className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full border-[6px] border-gray-950 bg-gradient-to-br ${avatarBg} overflow-hidden shadow-2xl flex items-center justify-center text-5xl sm:text-6xl font-black text-white relative`}>
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
                <Camera size={28} className="text-white" />
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* Profile Info Summary */}
      <div className="px-4 sm:px-8 pt-0 pb-6 flex flex-col gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white flex flex-wrap items-center gap-2 tracking-tight leading-tight break-words">
            {profile.full_name || profile.username}
            {badges.map((badge, idx) => (
              <span key={idx} title={badge.label} className="mt-1 flex items-center shrink-0">
                {badge.icon}
              </span>
            ))}
          </h1>
          <p className="text-gray-400 text-base sm:text-lg font-medium mt-1">@{profile.username}</p>
        </div>

        {/* Bio Section */}
        {profile.bio && (
          <p className="text-gray-200 text-base sm:text-lg leading-relaxed max-w-2xl whitespace-pre-wrap break-words">
            {profile.bio}
          </p>
        )}

        {/* Metadata Details */}
        <div className="flex flex-wrap gap-y-3 gap-x-4 text-sm text-gray-400 mt-2 items-center">
          {/* Profession / Role */}
          {(profile.plan_tier === 'pro' || profile.kyc_level === 'premium' || profile.kyc_level === 'admin') && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/10 text-white font-bold shrink-0">
              ⭐ Creator
            </div>
          )}
          
          {profile.country_code && (
            <div className="flex items-center gap-1.5 shrink-0">
              <MapPin size={16} className="text-gray-500" />
              <span>{getCountryName(profile.country_code)}</span>
            </div>
          )}
          {profile.website && (
            <div className="flex items-center gap-1.5 shrink-0 min-w-0">
              <Globe size={16} className="text-gray-500 shrink-0" />
              <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
          {profile.created_at && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Calendar size={16} className="text-gray-500" />
              <span>Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
