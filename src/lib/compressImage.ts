/**
 * Compress an image file using canvas.
 * - Resizes to max dimension (default 800px)
 * - Converts to JPEG with quality setting
 * - Returns base64 data URL
 */
export function compressImage(
  file: File,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<string> {
  const { maxWidth = 800, maxHeight = 800, quality = 0.6 } = options || {};

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onloadend = () => {
      img.src = reader.result as string;
    };

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to JPEG for better compression (even if original is PNG)
      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedBase64);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    reader.onerror = () => reject(new Error('Failed to read file'));

    reader.readAsDataURL(file);
  });
}
