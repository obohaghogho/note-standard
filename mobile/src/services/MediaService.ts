import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import apiClient from '../api/apiClient';
import { AuthService } from './AuthService';

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

      // CRITICAL FIX: Android 10+ blocks XHR reads of content:// URIs.
      // We must first copy the file to an accessible cache directory (file:// path).
      let readableUri = uri;
      if (Platform.OS === 'android' && uri.startsWith('content://')) {
        const destPath = `${(FileSystem as any).cacheDirectory}upload_${Date.now()}.${fileExt}`;
        try {
          await (FileSystem as any).copyAsync({ from: uri, to: destPath });
          readableUri = destPath;
          console.log('[MediaService] Copied content:// to file:// cache for Android:', destPath);
        } catch (copyErr) {
          console.error('[MediaService] Failed to copy content:// URI to cache:', copyErr);
          throw new Error('Could not read the selected file. Please try selecting it again.');
        }
      }

      // Direct high-performance native upload via FileSystem.uploadAsync (bypasses JS memory & XHR file GET block)
      let uploadData: { path: string } | null = null;
      let uploadRetries = 3;

      const token = await AuthService.getToken();
      const supabaseUrl = 'https://tngcvgisfctggvivcnva.supabase.co';
      const uploadUrl = `${supabaseUrl}/storage/v1/object/chat-media/${storagePath}`;

      while (uploadRetries > 0) {
        try {
          if (FileSystem && typeof (FileSystem as any).uploadAsync === 'function') {
            console.log(`[MediaService] Uploading ${storagePath} via FileSystem.uploadAsync from ${readableUri}`);
            const uploadResult = await (FileSystem as any).uploadAsync(uploadUrl, readableUri, {
              httpMethod: 'POST',
              uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT || 0,
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': fileType,
                'x-upsert': 'false'
              }
            });

            if (uploadResult.status < 200 || uploadResult.status >= 300) {
              throw new Error(`Upload HTTP ${uploadResult.status}: ${uploadResult.body}`);
            }

            uploadData = { path: storagePath };
            break;
          } else {
            // Fallback strategy for environments without FileSystem.uploadAsync
            let arrayBuffer: ArrayBuffer | null = null;
            if (typeof (FileSystem as any).readAsStringAsync === 'function') {
              const base64 = await (FileSystem as any).readAsStringAsync(readableUri, {
                encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
              });
              const binaryString = atob(base64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              arrayBuffer = bytes.buffer;
            }

            if (!arrayBuffer) throw new Error('Failed to read file buffer');

            const res = await fetch(uploadUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': fileType,
                'x-upsert': 'false'
              },
              body: arrayBuffer,
            });

            if (!res.ok) throw new Error(await res.text());
            uploadData = { path: storagePath };
            break;
          }
        } catch (error: any) {
          uploadRetries--;
          if (uploadRetries === 0) {
            console.error('[MediaService] Supabase REST upload error:', error);
            throw new Error(`Storage upload failed: ${error.message}`);
          }
          await new Promise(r => setTimeout(r, 2000));
        }
      }
 
      if (!uploadData) throw new Error('Storage upload failed');
 
      // Get file size for attachment registration
      let fileSize = 0;
      try {
        const fileInfo = await (FileSystem as any).getInfoAsync(readableUri);
        if (fileInfo && fileInfo.size) fileSize = fileInfo.size;
      } catch (_) {}

      // Create attachment record via our backend
      try {
        const res = await apiClient.post('/media/attachments', {
          conversationId: contextId,
          fileName: safeFileName,
          fileType,
          fileSize,
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
