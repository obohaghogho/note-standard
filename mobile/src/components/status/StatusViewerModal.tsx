import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, Image, TouchableOpacity,
  StyleSheet, SafeAreaView, Dimensions
} from 'react-native';
import { X, Trash2 } from 'lucide-react-native';
import apiClient from '../../api/apiClient';
import { StatusGroup, StatusItem } from './StatusTray';

const XIcon = X as any;
const Trash2Icon = Trash2 as any;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface StatusViewerModalProps {
  visible: boolean;
  group: StatusGroup | null;
  currentUserId?: string;
  onClose: () => void;
  onStatusDeleted?: () => void;
}

export const StatusViewerModal: React.FC<StatusViewerModalProps> = ({
  visible,
  group,
  currentUserId,
  onClose,
  onStatusDeleted,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [group]);

  if (!visible || !group || group.statuses.length === 0) return null;

  const currentStatus: StatusItem = group.statuses[currentIndex] || group.statuses[0];
  const isMine = currentStatus.user_id === currentUserId || group.username === 'My Status';

  const handleNext = () => {
    if (currentIndex < group.statuses.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`/status/${currentStatus.id}`);
      if (onStatusDeleted) onStatusDeleted();
      onClose();
    } catch (err) {
      console.warn('[StatusViewer] Delete error:', err);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.userInfo}>
            <Image
              source={{ uri: group.avatar_url || 'https://via.placeholder.com/150' }}
              style={styles.headerAvatar}
            />
            <View>
              <Text style={styles.headerName}>{group.full_name || group.username}</Text>
              <Text style={styles.headerTime}>
                {new Date(currentStatus.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            {isMine && (
              <TouchableOpacity style={styles.iconBtn} onPress={handleDelete}>
                <Trash2Icon size={20} color="#EF4444" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
              <XIcon size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Media Container */}
        <View style={styles.mediaContainer}>
          {currentStatus.media_url ? (
            <Image source={{ uri: currentStatus.media_url }} style={styles.mediaImage} resizeMode="contain" />
          ) : (
            <View style={styles.textOnlyBox}>
              <Text style={styles.textOnlyContent}>{currentStatus.caption || 'No content'}</Text>
            </View>
          )}

          {/* Tap Zones */}
          <TouchableOpacity style={styles.leftTap} onPress={handlePrev} />
          <TouchableOpacity style={styles.rightTap} onPress={handleNext} />
        </View>

        {/* Caption */}
        {currentStatus.caption && currentStatus.media_url && (
          <View style={styles.captionContainer}>
            <Text style={styles.captionText}>{currentStatus.caption}</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  headerName: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  headerTime: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    padding: 8,
    marginLeft: 8,
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  mediaImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
  textOnlyBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textOnlyContent: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  leftTap: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.35,
  },
  rightTap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.65,
  },
  captionContainer: {
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
  },
});
