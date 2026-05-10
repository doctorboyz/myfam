'use client';

import { useState } from 'react';
import { useFinance } from '@/context/FinanceContext';
import AvatarUploader from '@/components/ImageUploader/AvatarUploader';
import { Shield, User, Users, Layers, Tags, Pencil, Check, X, Trash2 } from 'lucide-react';
import Link from 'next/link';
import s from './profile.module.css';

export default function Profile() {
  const { currentUser, updateUser, accounts, deleteAccount } = useFinance();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

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

      {/* Menu — จัดการ */}
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

      {/* Menu — ส่วนตัว */}
      <div className={s.menuSection}>
        <div className={s.menuLabel}>ส่วนตัว</div>
        <div className={s.menuCard}>
          <Link href="/settings/tags" className={s.menuItem}>
            <Tags size={20} className={s.menuItemIcon} />
            <span className={s.menuItemLabel}>จัดการแท็ก</span>
            <span className={s.menuItemChevron}>›</span>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className={s.footer}>
        <div className={s.version}>เวอร์ชัน 1.0.0</div>
      </div>

      {/* Danger Zone — Hard Delete Accounts */}
      {isParent && accounts.filter(a => a.owner === currentUser.name).length > 0 && (
        <div className={s.dangerSection}>
          <div className={s.dangerLabel}>พื้นที่อันตราย</div>
          <div className={s.dangerCard}>
            {accounts.filter(a => a.owner === currentUser.name).map(account => (
              <div key={account.id} className={s.dangerItem}>
                <div className={s.dangerItemInfo}>
                  <span className={s.dangerItemName}>{account.name}</span>
                  <span className={s.dangerItemBalance}>฿{account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <button className={s.deleteBtn} onClick={() => setShowDeleteConfirm(account.id)}>
                  <Trash2 size={16} /> ลบ
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Overlay */}
      {showDeleteConfirm && (() => {
        const account = accounts.find(a => a.id === showDeleteConfirm);
        if (!account) return null;
        return (
          <div className={s.overlay} onClick={() => setShowDeleteConfirm(null)}>
            <div className={s.confirmDialog} onClick={(e) => e.stopPropagation()}>
              <h3 className={s.confirmTitle}>ลบบัญชี</h3>
              <p className={s.confirmText}>
                คุณแน่ใจหรือไม่ที่จะลบบัญชี <strong>{account.name}</strong>?
              </p>
              <p className={s.confirmWarning}>
                การดำเนินการนี้จะลบบัญชีและรายการธุรกรรมทั้งหมดถาวร ไม่สามารถกู้คืนได้
              </p>
              <div className={s.confirmActions}>
                <button className={s.cancelBtn} onClick={() => setShowDeleteConfirm(null)}>
                  ยกเลิก
                </button>
                <button className={s.dangerBtn} onClick={async () => {
                  await deleteAccount(showDeleteConfirm);
                  setShowDeleteConfirm(null);
                }}>
                  ลบถาวร
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}