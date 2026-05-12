import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../lib/supabase';
import apiClient from '../api/apiClient';

export class MediaService {
  static async pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permission to access media library was denied');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      return result.assets[0];
    }
    return null;
  }

  static async uploadMedia(uri: string, fileName: string, fileType: string, conversationId: string) {
    try {
      const fileExt = fileName.split('.').pop();
      const path = `${conversationId}/${Date.now()}.${fileExt}`;

      // Convert URI to Blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(path, blob, {
          contentType: fileType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Create attachment record in our backend
      const res = await apiClient.post('/media/attachments', {
        conversationId,
        fileName,
        fileType,
        fileSize: blob.size,
        storagePath: uploadData.path,
        metadata: {},
      });

      return res.data;
    } catch (err) {
      console.error('[MediaService] Upload failed:', err);
      throw err;
    }
  }
}
