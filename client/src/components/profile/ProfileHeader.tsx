import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, ShieldCheck, MapPin, Globe, Calendar, Star } from 'lucide-react';
import SecureImage from '../common/SecureImage';
import type { PublicProfile } from './PublicProfileModal';

interface ProfileHeaderProps {
  profile: PublicProfile;
  isOwner: boolean;
  completionPercentage?: number;
}

const getBadges = (profile: PublicProfile) => {
  const badges = [];
  if (profile.is_verified) badges.push({ icon: <CheckCircle size={16} className="text-blue-400" />, label: 'Verified', color: 'text-blue-400' });
  if (profile.kyc_level === 'premium') badges.push({ icon: <Star size={16} className="text-yellow-400" />, label: 'Premium', color: 'text-yellow-400' });
  if (profile.kyc_level === 'admin') badges.push({ icon: <ShieldCheck size={16} className="text-red-400" />, label: 'Admin', color: 'text-red-400' });
  return badges;
};

const getInitials = (name?: string, username?: string) => {
  if (name) return name.charAt(0).toUpperCase();
  if (username) return username.charAt(0).toUpperCase();
  return '?';
};

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({ profile, isOwner, completionPercentage = 0 }) => {
  const badges = getBadges(profile);

  return (
    <div className="relative flex flex-col w-full bg-gray-950 border-b border-white/10 rounded-t-3xl overflow-hidden">
      {/* Banner */}
      <div className="relative h-48 sm:h-64 w-full bg-gradient-to-br from-indigo-900 via-purple-900 to-gray-900 overflow-hidden">
        {profile.cover_url ? (
          <SecureImage src={profile.cover_url} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 opacity-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-600/30 via-purple-600/20 to-transparent" />
        )}
      </div>

      {/* Avatar & Info Container */}
      <div className="px-4 sm:px-6 lg:px-8 pb-6 -mt-16 sm:-mt-20 relative z-10 flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-end">
        {/* Avatar */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-gray-950 bg-gray-800 overflow-hidden shadow-xl flex items-center justify-center text-4xl font-bold text-gray-400">
            {profile.avatar_url ? (
              <SecureImage src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
            ) : (
              <span>{getInitials(profile.full_name, profile.username)}</span>
            )}
          </div>
          <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 w-5 h-5 bg-green-500 border-4 border-gray-950 rounded-full" title="Online"></div>
        </motion.div>

        {/* Profile Info Summary */}
        <div className="flex-1 mt-2 sm:mt-0 pt-2 sm:pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
              {profile.full_name || profile.username}
              {badges.map((badge, idx) => (
                <div key={idx} title={badge.label} className="mt-1">
                  {badge.icon}
                </div>
              ))}
            </h1>
            <p className="text-gray-400 text-sm sm:text-base">@{profile.username}</p>
          </div>
          
          <div className="hidden sm:flex items-center gap-3" id="profile-actions-desktop"></div>
        </div>
      </div>

      {/* Detailed Info */}
      <div className="px-4 sm:px-6 lg:px-8 pb-6 flex flex-col gap-4">
        {profile.bio && (
          <p className="text-gray-200 text-sm sm:text-base leading-relaxed max-w-2xl whitespace-pre-wrap">
            {profile.bio}
          </p>
        )}

        <div className="flex flex-wrap gap-y-2 gap-x-4 text-xs sm:text-sm text-gray-400">
          {profile.country_code && (
            <div className="flex items-center gap-1.5">
              <MapPin size={16} />
              <span>{profile.country_code.toUpperCase()}</span>
            </div>
          )}
          {profile.website && (
            <div className="flex items-center gap-1.5">
              <Globe size={16} />
              <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
          {profile.created_at && (
            <div className="flex items-center gap-1.5">
              <Calendar size={16} />
              <span>Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            </div>
          )}
        </div>

        {/* Profile Completion for Owner */}
        {isOwner && completionPercentage < 100 && (
          <div className="mt-4 p-4 rounded-2xl bg-gray-900/50 border border-gray-800 flex flex-col gap-2 max-w-xl">
            <div className="flex justify-between items-center text-sm">
              <span className="font-semibold text-gray-200">Profile Completion</span>
              <span className="text-primary">{completionPercentage}%</span>
            </div>
            <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${completionPercentage}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-primary"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Complete your profile to stand out! Add a bio, avatar, and banner.</p>
          </div>
        )}
      </div>
    </div>
  );
};
