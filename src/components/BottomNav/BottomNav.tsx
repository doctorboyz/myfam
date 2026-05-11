"use client";

import { LayoutDashboard, ClipboardList, Wallet, Calculator, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomNav.module.css';

const navItems = [
  { name: 'หน้าหลัก', path: '/dashboard', icon: LayoutDashboard },
  { name: 'รายการ', path: '/categories', icon: ClipboardList },
  { name: 'บัญชี', path: '/accounts', icon: Wallet },
  { name: 'งบประมาณ', path: '/budget', icon: Calculator },
  { name: 'โปรไฟล์', path: '/profile', icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname === '/login') return null;

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  // Uniform font size: shrink all labels if any label is too long
  const maxLabelLen = Math.max(...navItems.map(i => i.name.length));
  const labelClass = maxLabelLen > 6 ? styles.labelSmall : styles.label;

  return (
    <nav className={styles.nav}>
      {navItems.map((item) => (
        <Link
          key={item.path}
          href={item.path}
          className={`${styles.item} ${isActive(item.path) ? styles.active : ''}`}
        >
          <item.icon size={22} strokeWidth={isActive(item.path) ? 2.5 : 1.5} />
          <span className={labelClass}>{item.name}</span>
        </Link>
      ))}
    </nav>
  );
}