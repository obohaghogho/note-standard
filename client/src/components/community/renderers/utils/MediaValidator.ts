export interface MediaValidationConfig {
  maxImageSizeMB: number;
  maxVideoSizeMB: number;
  allowedImageTypes: string[];
  allowedVideoTypes: string[];
  maxVideoDurationSeconds: number;
}

const defaultConfig: MediaValidationConfig = {
  maxImageSizeMB: 10,
  maxVideoSizeMB: 100,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowedVideoTypes: ['video/mp4', 'video/webm'],
  maxVideoDurationSeconds: 120
};

export class MediaValidator {
  
  /**
   * Validate a media URL before rendering (basic sanitization)
   */
  static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      // Strictly enforce HTTPS for external media to prevent mixed content & basic injection
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' && parsed.hostname === 'localhost';
    } catch {
      return false;
    }
  }

  /**
   * Deep validation of a file before upload/rendering blob
   */
  static validateFile(file: File, type: 'image' | 'video', config = defaultConfig): { valid: boolean; error?: string } {
    const sizeMB = file.size / (1024 * 1024);

    if (type === 'image') {
      if (!config.allowedImageTypes.includes(file.type)) {
        return { valid: false, error: `Unsupported image format: ${file.type}` };
      }
      if (sizeMB > config.maxImageSizeMB) {
        return { valid: false, error: `Image exceeds ${config.maxImageSizeMB}MB limit` };
      }
    }

    if (type === 'video') {
      if (!config.allowedVideoTypes.includes(file.type)) {
         return { valid: false, error: `Unsupported video format: ${file.type}` };
      }
      if (sizeMB > config.maxVideoSizeMB) {
         return { valid: false, error: `Video exceeds ${config.maxVideoSizeMB}MB limit` };
      }
    }

    return { valid: true };
  }
}
