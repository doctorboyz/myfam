"use client";

import { Settings, ChevronLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useLiff } from '@/context/LiffContext';
import styles from './TopBar.module.css';

const TITLE_MAP: Record<string, string> = {
  '/dashboard': 'หน้าหลัก',
  '/categories': 'รายการ',
  '/history': 'รายการ',
  '/budget': 'งบประมาณ',
  '/profile': 'โปรไฟล์',
  '/': 'บัญชีของฉัน',
  '/settings': 'ตั้งค่า',
  '/settings/categories': 'หมวดหมู่',
  '/settings/family': 'สมาชิกครอบครัว',
};

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLiff } = useLiff();

  if (pathname === '/login') return null;

  // Hide TopBar inside LIFF (LINE provides its own header)
  if (isLiff) return null;

  const mainPaths = ['/dashboard', '/history', '/categories', '/budget', '/profile', '/'];
  const showBackButton = !mainPaths.includes(pathname);

  const getTitle = () => {
    // Check exact path first, then prefix match for dynamic routes
    if (TITLE_MAP[pathname]) return TITLE_MAP[pathname];
    if (pathname.startsWith('/account/')) return 'รายละเอียดบัญชี';
    if (pathname.startsWith('/budget/')) return 'รายละเอียดงบ';
    return 'MyFam';
  };

  return (
    <header className={styles.header}>
      {showBackButton ? (
        <button className={styles.backBtn} onClick={() => router.back()} aria-label="กลับ">
          <ChevronLeft size={24} strokeWidth={2} />
        </button>
      ) : (
        <div style={{ width: 40 }} />
      )}

      <h1 className={styles.title} style={{ flex: 1, textAlign: showBackButton ? 'center' : 'left' }}>
        {getTitle()}
      </h1>

      <button
        className={styles.settingsBtn}
        aria-label="ตั้งค่า"
        onClick={() => router.push('/settings')}
      >
        <Settings size={22} strokeWidth={2} />
      </button>
    </header>
  );
}
