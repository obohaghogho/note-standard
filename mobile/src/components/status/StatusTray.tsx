import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Image, ScrollView,
  StyleSheet, ActivityIndicator
} from 'react-native';
import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';
import { Plus } from 'lucide-react-native';

const PlusIcon = Plus as any;

export interface StatusItem {
  id: string;
  user_id: string;
  media_url?: string;
  media_type?: string;
  caption?: string;
  created_at: string;
  expires_at: string;
  user?: {
    username: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export interface StatusGroup {
  user_id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  statuses: StatusItem[];
  has_unread: boolean;
}

interface StatusTrayProps {
  onOpenViewer: (group: StatusGroup) => void;
  onOpenCreator: () => void;
}

export const StatusTray: React.FC<StatusTrayProps> = ({ onOpenViewer, onOpenCreator }) => {
  const { user } = useAuth();
  const [feed, setFeed] = useState<StatusGroup[]>([]);
  const [myStatuses, setMyStatuses] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStatusFeed = useCallback(async () => {
    try {
      setLoading(true);
      const [feedRes, myRes] = await Promise.allSettled([
        apiClient.get('/status/feed'),
        apiClient.get('/status/me'),
      ]);

      if (feedRes.status === 'fulfilled' && feedRes.value.data) {
        setFeed(feedRes.value.data.feed || feedRes.value.data || []);
      }
      if (myRes.status === 'fulfilled' && myRes.value.data) {
        setMyStatuses(myRes.value.data.statuses || myRes.value.data || []);
      }
    } catch (err) {
      console.warn('[StatusTray] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatusFeed();
  }, [fetchStatusFeed]);

  const hasMyStatus = myStatuses.length > 0;
  const myAvatar = user?.avatar_url || 'https://via.placeholder.com/150';

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* My Status Bubble */}
        <TouchableOpacity
          style={styles.avatarWrapper}
          onPress={() => {
            if (hasMyStatus) {
              onOpenViewer({
                user_id: user?.id || 'me',
                username: 'My Status',
                full_name: 'You',
                avatar_url: user?.avatar_url,
                statuses: myStatuses,
                has_unread: false,
              });
            } else {
              onOpenCreator();
            }
          }}
        >
          <View style={[styles.avatarRing, hasMyStatus ? styles.activeRing : styles.myRing]}>
            <Image source={{ uri: myAvatar }} style={styles.avatarImage} />
            {!hasMyStatus && (
              <View style={styles.plusBadge}>
                <PlusIcon size={12} color="#FFFFFF" />
              </View>
            )}
          </View>
          <Text style={styles.avatarLabel} numberOfLines={1}>
            {hasMyStatus ? 'My Status' : 'Add Status'}
          </Text>
        </TouchableOpacity>

        {/* Contact Feed Items */}
        {feed.map((group) => (
          <TouchableOpacity
            key={group.user_id}
            style={styles.avatarWrapper}
            onPress={() => onOpenViewer(group)}
          >
            <View style={[styles.avatarRing, group.has_unread ? styles.unreadRing : styles.readRing]}>
              <Image
                source={{ uri: group.avatar_url || 'https://via.placeholder.com/150' }}
                style={styles.avatarImage}
              />
            </View>
            <Text style={styles.avatarLabel} numberOfLines={1}>
              {group.full_name || group.username}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#090915',
  },
  scrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  avatarWrapper: {
    alignItems: 'center',
    marginRight: 16,
    width: 64,
  },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2,
    justify: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  myRing: {
    borderColor: '#374151',
    borderWidth: 1.5,
  },
  activeRing: {
    borderColor: '#6366f1',
    borderWidth: 2,
  },
  unreadRing: {
    borderColor: '#10b981',
    borderWidth: 2.5,
  },
  readRing: {
    borderColor: '#4b5563',
    borderWidth: 1.5,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  plusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#6366f1',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#090915',
  },
  avatarLabel: {
    color: '#D1D5DB',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
});
