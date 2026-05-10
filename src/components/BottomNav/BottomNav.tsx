"use client";

import { LayoutDashboard, ClipboardList, Home, Calculator, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLiff } from '@/context/LiffContext';
import styles from './BottomNav.module.css';

const navItems = [
  { name: 'หน้าหลัก', path: '/dashboard', icon: LayoutDashboard },
  { name: 'รายการ', path: '/categories', icon: ClipboardList },
  { name: 'หน้าแรก', path: '/', icon: Home },
  { name: 'งบ', path: '/budget', icon: Calculator },
  { name: 'โปรไฟล์', path: '/profile', icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { isLiff } = useLiff();

  if (pathname === '/login') return null;

  const isActive = (path: string) => pathname === path;

  return (
    <nav className={`${styles.nav} ${isLiff ? styles.liffNav : ''}`}>
      {navItems.map((item) => (
        <Link
          key={item.path}
          href={item.path}
          className={`${styles.item} ${isActive(item.path) ? styles.active : ''}`}
        >
          <item.icon size={24} strokeWidth={isActive(item.path) ? 2.5 : 2} />
          <span className={styles.label}>{item.name}</span>
        </Link>
      ))}
    </nav>
  );
}
