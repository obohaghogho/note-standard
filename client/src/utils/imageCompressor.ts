/**
 * Client-side file compressor using HTML5 Canvas & Blob API
 * Reduces image file sizes before sending over network to save bandwidth.
 */

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  previewUrl: string;
}

export async function compressImageFile(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1080,
  quality: number = 0.82
): Promise<CompressionResult> {
  const originalSize = file.size;

  // Non-image or PDF files bypass image canvas compression
  if (!file.type.startsWith('image/')) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1.0,
      previewUrl: URL.createObjectURL(file),
    };
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          file,
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1.0,
          previewUrl: URL.createObjectURL(file),
        });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({
              file,
              originalSize,
              compressedSize: originalSize,
              compressionRatio: 1.0,
              previewUrl: URL.createObjectURL(file),
            });
            return;
          }

          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          const compressedSize = compressedFile.size;
          const compressionRatio = Number((compressedSize / originalSize).toFixed(2));
          const previewUrl = URL.createObjectURL(compressedFile);

          resolve({
            file: compressedFile,
            originalSize,
            compressedSize,
            compressionRatio,
            previewUrl,
          });
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      resolve({
        file,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1.0,
        previewUrl: URL.createObjectURL(file),
      });
    };

    img.src = url;
  });
}
