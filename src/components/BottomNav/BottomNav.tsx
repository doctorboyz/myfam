"use client";

import { LayoutDashboard, ClipboardList, Wallet, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomNav.module.css';

const navItems = [
  { name: 'หน้าหลัก', path: '/dashboard', icon: LayoutDashboard },
  { name: 'รายการ', path: '/transactions', icon: ClipboardList },
  { name: 'บัญชี', path: '/accounts', icon: Wallet },
  { name: 'โปรไฟล์', path: '/profile', icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname === '/login') return null;

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  return (
    <nav className={styles.nav} aria-label="เมนูหลัก">
      <div className={styles.pill}>
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`${styles.item} ${active ? styles.active : ''}`}
              aria-label={item.name}
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.iconWrap}>
                <item.icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              </span>
              <span className={styles.label}>{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
