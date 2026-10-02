"use client";

import { User } from "lucide-react";
import styles from "./AvatarRing.module.css";

interface AvatarRingProps {
  name: string;
  color?: string;
  avatar?: string | null;
  size?: number;
  active?: boolean;
  className?: string;
}

export function AvatarRing({
  name,
  color = "var(--transfer)",
  avatar,
  size = 48,
  active = false,
  className = "",
}: AvatarRingProps) {
  return (
    <div
      className={`${styles.wrap} ${active ? styles.active : ''} ${className}`}
      style={{ width: size, height: size, ['--ring-color' as string]: color }}
      aria-label={`${name}${active ? ' มีกิจกรรมล่าสุด' : ''}`}
    >
      <div className={styles.inner} style={{ backgroundColor: color }}>
        {avatar ? (
          <img src={avatar} alt={name} className={styles.img} />
        ) : (
          <User size={size * 0.45} color="#fff" strokeWidth={1.8} />
        )}
      </div>
    </div>
  );
}
