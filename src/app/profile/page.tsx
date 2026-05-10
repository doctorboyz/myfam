'use client';

import { useFinance } from '@/context/FinanceContext';
import AvatarUploader from '@/components/ImageUploader/AvatarUploader';
import { LogOut, Shield, User, Users, Layers } from 'lucide-react';
import Link from 'next/link';
import s from './profile.module.css';

export default function Profile() {
  const { currentUser, updateUser, logout } = useFinance();

  if (!currentUser) return <div className={s.page}>กำลังโหลดโปรไฟล์...</div>;

  const isParent = currentUser.role === 'parent';
  const isAdmin = currentUser.isAdmin;

  const handleAvatarUpdate = (base64: string) => {
    updateUser(currentUser.id, { avatar: base64 });
  };

  return (
    <div className={s.page}>
      {/* Profile Card */}
      <div className={s.profileCard}>
        <div className={s.avatarWrap}>
          <AvatarUploader
            currentAvatar={currentUser.avatar}
            name={currentUser.name}
            color={currentUser.color}
            onUpload={handleAvatarUpdate}
            editable={true}
            size={80}
          />
        </div>
        <h1 className={s.name}>{currentUser.name}</h1>
        <div className={s.roleBadge}>
          {isParent ? <Shield size={14} color="var(--primary)" /> : <User size={14} color="var(--primary)" />}
          <span className={s.roleText}>{isParent ? 'ผู้ปกครอง' : 'สมาชิก'}</span>
        </div>
      </div>

      {/* Menu */}
      {(isParent || isAdmin) && (
        <div className={s.menuSection}>
          <div className={s.menuLabel}>จัดการ</div>
          <div className={s.menuCard}>
            {isParent && (
              <Link href="/settings/family" className={s.menuItem}>
                <Users size={20} className={s.menuItemIcon} />
                <span className={s.menuItemLabel}>สมาชิกครอบครัว</span>
                <span className={s.menuItemChevron}>›</span>
              </Link>
            )}
            {isAdmin && (
              <Link href="/settings/categories" className={s.menuItem}>
                <Layers size={20} className={s.menuItemIcon} />
                <span className={s.menuItemLabel}>หมวดหมู่</span>
                <span className={s.menuItemChevron}>›</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={s.footer}>
        <div className={s.version}>เวอร์ชัน 1.0.0</div>
        <button className={s.logout} onClick={() => logout()}>
          <LogOut size={20} />
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}