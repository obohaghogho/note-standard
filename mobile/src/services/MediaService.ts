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
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      return result.assets[0];
    }
    return null;
  }

  /**
   * Upload media to Supabase Storage and create an attachment record.
   * 
   * @param uri - Local file URI
   * @param fileName - File name (e.g. "photo.jpg")
   * @param fileType - MIME type (e.g. "image/jpeg")
   * @param contextId - Conversation ID or Team ID (used as the storage folder)
   */
  static async uploadMedia(uri: string, fileName: string, fileType: string, contextId: string) {
    try {
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileExt = safeFileName.split('.').pop() || 'bin';
      const storagePath = `${contextId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      // Convert URI to ArrayBuffer using XMLHttpRequest for maximum RN/Android compatibility
      const arrayBuffer: ArrayBuffer = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = (e) => {
          console.error('[MediaService] XHR error:', e);
          reject(new Error('Failed to read local file (Network request failed)'));
        };
        xhr.responseType = 'arraybuffer';
        xhr.open('GET', uri, true);
        xhr.send(null);
      });

      console.log(`[MediaService] Uploading ${storagePath} (${arrayBuffer.byteLength} bytes, type: ${fileType})`);

      // Upload to Supabase Storage (bucket: chat-media)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(storagePath, arrayBuffer, {
          contentType: fileType,
          cacheControl: '3600',
          upsert: false,
        });
 
      if (uploadError) {
        console.error('[MediaService] Supabase upload error:', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }
 
      console.log('[MediaService] Upload successful, creating attachment record...');
 
      // Create attachment record via our backend
      try {
        const res = await apiClient.post('/media/attachments', {
          conversationId: contextId,
          fileName: safeFileName,
          fileType,
          fileSize: arrayBuffer.byteLength,
          storagePath: uploadData.path,
          metadata: {},
        });
        
        console.log('[MediaService] Attachment record created:', res.data?.id);
        return res.data;
      } catch (backendErr: any) {
        console.error('[MediaService] Backend attachment creation failed:', backendErr);
        // If backend fails, we should technically delete the orphan storage file, 
        // but for now we throw a clear error.
        throw new Error(`Failed to register attachment: ${backendErr.response?.data?.error || backendErr.message}`);
      }
    } catch (err: any) {
      console.error('[MediaService] Upload root error:', err);
      throw err;
    }
  }
}
