"use client";

import { Settings, ChevronLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import styles from './TopBar.module.css';

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/login') return null;

  const mainPaths = ['/dashboard', '/categories', '/budget', '/profile', '/'];
  const showBackButton = !mainPaths.includes(pathname);

  const getTitle = () => {
    switch (pathname) {
      case '/dashboard': return 'Dashboard';
      case '/categories': return 'Categories';
      case '/budget': return 'Budget';
      case '/profile': return 'Profile';
      case '/': return 'My Accounts';
      default: return 'My Fam';
    }
  };

  return (
    <header className={styles.header}>
      {showBackButton ? (
        <button className={styles.backBtn} onClick={() => router.back()} aria-label="Go Back">
          <ChevronLeft size={24} strokeWidth={2} />
        </button>
      ) : (
        <div style={{ width: 40 }} /> // Spacer to balance layout if needed, or remove to align Title left
      )}
      
      <h1 className={styles.title} style={{ flex: 1, textAlign: showBackButton ? 'center' : 'left' }}>
        {getTitle()}
      </h1>

      <button 
        className={styles.settingsBtn} 
        aria-label="Settings"
        onClick={() => router.push('/settings')}
      >
        <Settings size={22} strokeWidth={2} />
      </button>
    </header>
  );
}
