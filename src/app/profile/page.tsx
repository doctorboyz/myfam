'use client';

import { useState } from 'react';
import { useFinance } from '@/context/FinanceContext';
import AvatarUploader from '@/components/ImageUploader/AvatarUploader';
import { Shield, User, Users, Layers, Pencil, Check, X } from 'lucide-react';
import Link from 'next/link';
import s from './profile.module.css';

export default function Profile() {
  const { currentUser, updateUser } = useFinance();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  if (!currentUser) return <div className={s.page}>กำลังโหลดโปรไฟล์...</div>;

  const isParent = currentUser.role === 'parent';
  const isAdmin = currentUser.isAdmin;

  const handleAvatarUpdate = (base64: string) => {
    updateUser(currentUser.id, { avatar: base64 });
  };

  const startEditName = () => {
    setEditName(currentUser.name);
    setIsEditingName(true);
  };

  const saveName = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== currentUser.name) {
      updateUser(currentUser.id, { name: trimmed });
    }
    setIsEditingName(false);
  };

  const cancelEditName = () => {
    setIsEditingName(false);
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

        {isEditingName ? (
          <div className={s.editNameRow}>
            <input
              className={s.editNameInput}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEditName(); }}
              autoFocus
              maxLength={50}
            />
            <button className={s.editBtn} onClick={saveName} aria-label="บันทึก">
              <Check size={18} />
            </button>
            <button className={s.cancelBtn} onClick={cancelEditName} aria-label="ยกเลิก">
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className={s.nameRow}>
            <h1 className={s.name}>{currentUser.name}</h1>
            <button className={s.editIcon} onClick={startEditName} aria-label="แก้ไขชื่อ">
              <Pencil size={16} />
            </button>
          </div>
        )}

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
      </div>
    </div>
  );
}