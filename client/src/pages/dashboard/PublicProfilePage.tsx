import React from 'react';
import { useParams } from 'react-router-dom';
import { PublicProfileModal } from '../../components/profile/PublicProfileModal';

export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>();

  return (
    <div className="w-full min-h-screen bg-gray-950">
      <PublicProfileModal userId={userId} isPage={true} />
    </div>
  );
}
