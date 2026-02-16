"use client";

import { useRef, ChangeEvent } from 'react';
import { Camera } from 'lucide-react';
import { compressImage } from '@/lib/compressImage';

interface AvatarUploaderProps {
  currentAvatar?: string;
  name: string;
  color: string;
  onUpload: (base64: string) => void;
  editable?: boolean;
  size?: number;
}

export default function AvatarUploader({ currentAvatar, name, color, onUpload, editable = true, size = 80 }: AvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, { maxWidth: 500, maxHeight: 500, quality: 0.8 });
      onUpload(compressed);
    } catch (err) {
      console.error('Image compression failed:', err);
    }
  };

  const handleClick = () => {
    if (editable && fileInputRef.current) {
        fileInputRef.current.click();
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        onClick={handleClick}
        style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: currentAvatar ? `url(${currentAvatar}) center/cover no-repeat` : color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: size * 0.4,
            fontWeight: 'bold',
            border: '4px solid var(--background)',
            cursor: editable ? 'pointer' : 'default',
            position: 'relative',
            boxShadow: 'var(--shadow-sm)'
        }}
      >
        {!currentAvatar && name[0]}

        {editable && (
            <div style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                background: 'var(--foreground)',
                width: size * 0.35,
                height: size * 0.35,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--card-bg)'
            }}>
                <Camera size={size * 0.18} color="var(--background)" strokeWidth={2.5} />
            </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
    </div>
  );
}
