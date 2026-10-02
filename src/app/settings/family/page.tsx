'use client';

import { useFinance } from '@/context/FinanceContext';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Check, Trash2, X } from 'lucide-react';
import AvatarUploader from '@/components/ImageUploader/AvatarUploader';
import { User, UserRole } from '@/types';
import s from './family.module.css';
import { hapticImpact, hapticNotification } from '@/lib/haptics';

type FormMode = 'idle' | 'add' | 'edit';

export default function FamilyManagement() {
  const { currentUser, users, refreshUsers, removeUser, getUserLabel } = useFinance();
  const router = useRouter();

  const [mode, setMode] = useState<FormMode>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('child');
  const [avatar, setAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [aliasDraft, setAliasDraft] = useState('');
  const [telegramCode, setTelegramCode] = useState<{ code: string; displayName: string } | null>(null);

  useEffect(() => {
    refreshUsers();
    fetch('/api/users/alias')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.aliases) {
          const map: Record<string, string> = {};
          data.aliases.forEach((a: { targetId: string; alias: string }) => {
            map[a.targetId] = a.alias;
          });
          setAliases(map);
        }
      })
      .catch(() => {});
  }, [refreshUsers]);

  // refreshUsers is stable from context; effect runs on mount.

  if (!currentUser) return <div className={s.page}>กำลังโหลด...</div>;

  if (currentUser.role !== 'parent') {
    return (
      <div className={s.denied}>
        <h2>ไม่มีสิทธิ์เข้าถึง</h2>
        <p>เฉพาะผู้ปกครองเท่านั้นที่สามารถจัดการสมาชิกครอบครัวได้</p>
        <button className={s.deniedBtn} onClick={() => router.back()}>ย้อนกลับ</button>
      </div>
    );
  }

  const resetForm = () => {
    setMode('idle');
    setEditingId(null);
    setUsername('');
    setPassword('');
    setRole('child');
    setAvatar('');
    setError(null);
    setAliasDraft('');
  };

  const startAdd = () => {
    hapticImpact('light');
    resetForm();
    setMode('add');
  };

  const startEdit = (user: User) => {
    hapticImpact('light');
    resetForm();
    setMode('edit');
    setEditingId(user.id);
    setUsername(user.name);
    setRole(user.role);
    setAvatar(user.avatar || '');
    setAliasDraft(aliases[user.id] || '');
  };

  const handleSave = async () => {
    setError(null);
    if (!username.trim()) {
      setError('กรุณากรอกชื่อผู้ใช้');
      return;
    }
    if (mode === 'add' && !password) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setSaving(true);
    try {
      if (mode === 'add') {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.trim(),
            password,
            role,
            avatar,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'สร้างสมาชิกไม่สำเร็จ');
          setSaving(false);
          return;
        }
      } else if (mode === 'edit' && editingId) {
        const body: Record<string, unknown> = {
          name: username.trim(),
          role,
          avatar,
        };
        if (password) body.password = password;

        const res = await fetch(`/api/users/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'แก้ไขไม่สำเร็จ');
          setSaving(false);
          return;
        }

        // Save alias if changed
        const prevAlias = aliases[editingId] || '';
        const nextAlias = aliasDraft.trim();
        if (nextAlias !== prevAlias) {
          if (nextAlias) {
            await fetch('/api/users/alias', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetId: editingId, alias: nextAlias }),
            });
            setAliases({ ...aliases, [editingId]: nextAlias });
          } else if (prevAlias) {
            await fetch(`/api/users/alias?targetId=${editingId}`, { method: 'DELETE' });
            const next = { ...aliases };
            delete next[editingId];
            setAliases(next);
          }
        }
      }

      await refreshUsers();
      hapticNotification('success');
      resetForm();
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
      hapticNotification('error');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    hapticImpact('medium');
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบสมาชิกคนนี้?')) return;
    removeUser(id);
    await refreshUsers();
    hapticNotification('success');
  };

  const handleTelegramCode = async (userId: string) => {
    setError(null);
    try {
      const res = await fetch('/api/telegram/link-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'สร้างรหัส Telegram ไม่สำเร็จ');
        hapticNotification('error');
        return;
      }
      hapticNotification('success');
      setTelegramCode({ code: data.code, displayName: data.displayName });
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.back()}>
          <ChevronLeft size={24} />
        </button>
        <h2 className={s.title}>สมาชิกครอบครัว</h2>
      </header>

      <div className={s.memberList}>
        {users.map((user) => {
          const isEditing = mode === 'edit' && editingId === user.id;
          if (isEditing) {
            return (
              <div key={user.id} className={s.memberCardEditing}>
                <AvatarUploader
                  currentAvatar={avatar}
                  name={username || '?'}
                  color={user.color}
                  editable={true}
                  onUpload={(base64) => setAvatar(base64)}
                  size={50}
                />
                <div className={s.memberInfo}>
                  <input
                    className={s.nameInput}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ชื่อผู้ใช้ (login)"
                  />
                  {user.id !== currentUser.id && (
                    <input
                      className={s.aliasInput}
                      value={aliasDraft}
                      onChange={(e) => setAliasDraft(e.target.value)}
                      placeholder="ชื่อที่แสดงให้ฉัน (alias)"
                      maxLength={50}
                    />
                  )}
                  <input
                    className={s.aliasInput}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="รหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)"
                  />
                  <div className={s.roleRadios}>
                    <label className={s.roleLabel}>
                      <input
                        type="radio"
                        checked={role === 'parent'}
                        onChange={() => setRole('parent')}
                      />
                      ผู้ปกครอง
                    </label>
                    <label className={s.roleLabel}>
                      <input
                        type="radio"
                        checked={role === 'child'}
                        onChange={() => setRole('child')}
                      />
                      ลูก
                    </label>
                  </div>
                </div>
                <div className={s.actions}>
                  <button className={s.saveBtn} onClick={handleSave} disabled={saving}>
                    <Check size={18} />
                  </button>
                  <button className={s.cancelBtn} onClick={resetForm}>
                    <X size={18} />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={user.id} className={s.memberCard}>
              <AvatarUploader
                currentAvatar={user.avatar}
                name={getUserLabel(user.id, user.name)}
                color={user.color}
                editable={false}
                onUpload={() => {}}
                size={50}
              />
              <div className={s.memberInfo}>
                <div className={s.memberName}>{getUserLabel(user.id, user.name)}</div>
                <div className={s.memberRole}>{user.role === 'parent' ? 'ผู้ปกครอง' : 'ลูก'}</div>
              </div>
              <div className={s.actions}>
                <button className={s.editBtn} onClick={() => startEdit(user)}>แก้ไข</button>
                <button className={s.telegramBtn} onClick={() => handleTelegramCode(user.id)}>
                  รหัส Telegram
                </button>
                {user.id !== currentUser.id && (
                  <button className={s.deleteBtn} onClick={() => handleDelete(user.id)} aria-label="ลบสมาชิก">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {mode === 'add' && (
        <div className={s.addCard}>
          <AvatarUploader
            currentAvatar={avatar}
            name={username || '?'}
            color="#CCC"
            editable={true}
            onUpload={(base64) => setAvatar(base64)}
            size={50}
          />
          <div className={s.memberInfo}>
            <input
              className={s.nameInput}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ชื่อผู้ใช้ (login)"
              autoFocus
            />
            <input
              className={s.aliasInput}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสผ่าน"
            />
            <div className={s.roleRadios}>
              <label className={s.roleLabel}>
                <input
                  type="radio"
                  checked={role === 'parent'}
                  onChange={() => setRole('parent')}
                />
                ผู้ปกครอง
              </label>
              <label className={s.roleLabel}>
                <input
                  type="radio"
                  checked={role === 'child'}
                  onChange={() => setRole('child')}
                />
                ลูก
              </label>
            </div>
          </div>
          <div className={s.actions}>
            <button className={s.saveBtn} onClick={handleSave} disabled={saving}>
              <Check size={18} />
            </button>
            <button className={s.cancelBtn} onClick={resetForm}>
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {error && <div className={s.errorBanner}>{error}</div>}

      {telegramCode && (
        <div className={s.codeBanner}>
          <div className={s.codeText}>
            รหัสเชื่อม Telegram ของ <strong>{telegramCode.displayName}</strong>:
          </div>
          <div className={s.codeValue}>{telegramCode.code}</div>
          <div className={s.codeHint}>
            ให้ส่งข้อความนี้ไปที่ Telegram ของเขา:
            <code> /start {telegramCode.code}</code>
          </div>
          <div className={s.codeHint}>รหัสหมดอายุใน 7 วัน และใช้ได้ครั้งเดียว</div>
          <button className={s.codeClose} onClick={() => setTelegramCode(null)}>ปิด</button>
        </div>
      )}

      {mode === 'idle' && (
        <button className={s.addBtn} onClick={startAdd}>
          <Plus size={20} />
          เพิ่มสมาชิกครอบครัว
        </button>
      )}
    </div>
  );
}