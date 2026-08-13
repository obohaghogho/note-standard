import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera as CameraRaw, Image as ImageIconRaw, X as XRaw } from 'lucide-react-native';

const Camera = CameraRaw as any;
const ImageIcon = ImageIconRaw as any;
const X = XRaw as any;

interface ImagePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onImageSelected: (image: { uri: string; type: string; name: string }) => void;
  title?: string;
  allowAspect?: [number, number];
}

export const ImagePickerModal: React.FC<ImagePickerModalProps> = ({
  visible,
  onClose,
  onImageSelected,
  title = 'Select Image Source',
  allowAspect = [1, 1],
}) => {
  const [loading, setLoading] = React.useState(false);

  const processSelection = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets || result.assets.length === 0) {
      setLoading(false);
      return;
    }

    const asset = result.assets[0];

    // File size check: 5MB limit
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      Alert.alert('Image Too Large', 'Please select an image smaller than 5MB.');
      setLoading(false);
      return;
    }

    const fileName = asset.fileName || `image_${Date.now()}.jpg`;
    const fileType = asset.mimeType || 'image/jpeg';

    onImageSelected({
      uri: asset.uri,
      type: fileType,
      name: fileName,
    });
    setLoading(false);
    onClose();
  };

  const handleCamera = async () => {
    try {
      setLoading(true);
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to capture photos.');
        setLoading(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: allowAspect,
        quality: 0.8,
      });

      processSelection(result);
    } catch (error) {
      console.error('[ImagePickerModal] Camera error:', error);
      Alert.alert('Camera Error', 'Could not open camera.');
      setLoading(false);
    }
  };

  const handleGallery = async () => {
    try {
      setLoading(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed to select images.');
        setLoading(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: allowAspect,
        quality: 0.8,
      });

      processSelection(result);
    } catch (error) {
      console.error('[ImagePickerModal] Gallery error:', error);
      Alert.alert('Gallery Error', 'Could not open photo library.');
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.container} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>Processing image...</Text>
            </View>
          ) : (
            <View style={styles.optionsRow}>
              <TouchableOpacity style={styles.optionBtn} onPress={handleCamera}>
                <View style={[styles.iconBg, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Camera size={26} color="#3B82F6" />
                </View>
                <Text style={styles.optionLabel}>Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.optionBtn} onPress={handleGallery}>
                <View style={[styles.iconBg, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <ImageIcon size={26} color="#10B981" />
                </View>
                <Text style={styles.optionLabel}>Photo Library</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
  },
  optionBtn: {
    alignItems: 'center',
    width: 120,
  },
  iconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#94A3B8',
  },
});
