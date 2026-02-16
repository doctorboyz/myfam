"use client";

import { LayoutDashboard, Layers, Home, Calculator, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomNav.module.css';

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname === '/login') return null;

  const isActive = (path: string) => pathname === path;

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Categories', path: '/categories', icon: Layers },
    { name: 'Home', path: '/', icon: Home },
    { name: 'Budget', path: '/budget', icon: Calculator },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  return (
    <nav className={styles.nav}>
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
