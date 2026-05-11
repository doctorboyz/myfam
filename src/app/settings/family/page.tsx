'use client';

import { useFinance } from '@/context/FinanceContext';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Check, Trash2, X, Link2, Copy, CheckCircle } from 'lucide-react';
import AvatarUploader from '@/components/ImageUploader/AvatarUploader';
import { User, UserRole } from '@/types';
import s from './family.module.css';

export default function FamilyManagement() {
  const { users, currentUser, updateUser, addUser, removeUser } = useFinance();
  const router = useRouter();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({});
  const [inviteState, setInviteState] = useState<{ userId: string; code: string; copied: boolean } | null>(null);
  const [inviteLoading, setInviteLoading] = useState<string | null>(null);

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

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setFormData(user);
    setIsAdding(false);
  };

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId('new');
    setFormData({ name: '', role: 'child', color: '#GRAY', avatar: '' });
  };

  const handleSave = () => {
    if (!formData.name) return;

    if (isAdding) {
      const newUser: Omit<User, 'familyId'> & { familyId?: string } = {
        id: Date.now().toString(),
        name: formData.name,
        role: (formData.role as UserRole) || 'child',
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        avatar: formData.avatar,
        familyId: currentUser?.familyId || '',
      };
      addUser(newUser as User);
    } else if (editingId) {
      updateUser(editingId, formData);
    }

    setEditingId(null);
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('คุณแน่ใจหรือไม่ที่จะลบสมาชิกคนนี้?')) {
      removeUser(id);
    }
  };

  const handleCreateInvite = async (userId: string) => {
    setInviteLoading(userId);
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.success) {
        setInviteState({ userId, code: data.invite.code, copied: false });
      } else {
        alert(data.error || 'ไม่สามารถสร้างลิงก์เชิญได้');
      }
    } catch {
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
    setInviteLoading(null);
  };

  const handleCopyLink = () => {
    if (!inviteState) return;
    const baseUrl = process.env.NEXT_PUBLIC_LIFF_URL || window.location.origin;
    const link = `${baseUrl}/link?code=${inviteState.code}`;
    navigator.clipboard.writeText(link).then(() => {
      setInviteState({ ...inviteState, copied: true });
      setTimeout(() => {
        if (inviteState) setInviteState({ ...inviteState, copied: false });
      }, 2000);
    });
  };

  const handleSendLine = async () => {
    if (!inviteState) return;
    try {
      const liffModule = await import('@line/liff');
      const liff = liffModule.default || liffModule;
      const baseUrl = process.env.NEXT_PUBLIC_LIFF_URL || window.location.origin;
      const link = `${baseUrl}/link?code=${inviteState.code}`;
      const userName = users.find(u => u.id === inviteState.userId)?.name || '';
      await liff.sendMessages([
        {
          type: 'text',
          text: `${currentUser.name} เชิญคุณเข้าร่วม MyFam! 🏠💰\n\nคลิกลิงก์ด้านล่างเพื่อเชื่อมบัญชี LINE กับ ${userName || 'สมาชิก'}\n\n${link}`,
        },
      ]);
      alert('ส่งข้อความเรียบร้อยแล้ว!');
    } catch {
      // Fallback to copy if sendMessages fails
      handleCopyLink();
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
          const isEditing = editingId === user.id;
          const isLinked = !!(user as User & { lineLink?: { lineUserId: string } | null }).lineLink;
          const isInviteOpen = inviteState?.userId === user.id;

          return (
            <div key={user.id} className={isEditing ? s.memberCardEditing : s.memberCard}>
              <AvatarUploader
                currentAvatar={isEditing ? formData.avatar : user.avatar}
                name={isEditing && formData.name ? formData.name : user.name}
                color={user.color}
                editable={isEditing}
                onUpload={(base64) => setFormData({ ...formData, avatar: base64 })}
                size={50}
              />

              <div className={s.memberInfo}>
                {isEditing ? (
                  <input
                    className={s.nameInput}
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="ชื่อ"
                  />
                ) : (
                  <div className={s.memberName}>{user.name}</div>
                )}

                {isEditing ? (
                  <div className={s.roleRadios}>
                    <label className={s.roleLabel}>
                      <input
                        type="radio"
                        checked={formData.role === 'parent'}
                        onChange={() => setFormData({ ...formData, role: 'parent' })}
                      />
                      ผู้ปกครอง
                    </label>
                    <label className={s.roleLabel}>
                      <input
                        type="radio"
                        checked={formData.role === 'child'}
                        onChange={() => setFormData({ ...formData, role: 'child' })}
                      />
                      ลูก
                    </label>
                  </div>
                ) : (
                  <div className={s.memberRole}>
                    {user.role === 'parent' ? 'ผู้ปกครอง' : 'ลูก'}
                    {isLinked && <span style={{ marginLeft: 6, color: 'var(--success, #00b386)' }}>● เชื่อมแล้ว</span>}
                  </div>
                )}
              </div>

              <div className={s.actions}>
                {isEditing ? (
                  <>
                    <button className={s.saveBtn} onClick={handleSave}>
                      <Check size={18} />
                    </button>
                    <button className={s.cancelBtn} onClick={() => setEditingId(null)}>
                      <X size={18} />
                    </button>
                    <button className={s.deleteBtn} onClick={() => handleDelete(user.id)} aria-label="ลบสมาชิก">
                      <Trash2 size={16} />
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {!isLinked && user.id !== currentUser.id && (
                      <button
                        className={s.inviteBtn}
                        onClick={() => handleCreateInvite(user.id)}
                        disabled={inviteLoading === user.id}
                        aria-label="ส่งคำเชิญ"
                        title="ส่งลิงก์เชื่อม LINE"
                      >
                        <Link2 size={14} />
                      </button>
                    )}
                    <button className={s.editBtn} onClick={() => handleEdit(user)}>
                      แก้ไข
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invite link display */}
      {inviteState && (
        <div className={s.inviteOverlay} onClick={() => setInviteState(null)}>
          <div className={s.inviteCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={s.inviteTitle}>ลิงก์เชิญพร้อมใช้งาน</h3>
            <p className={s.inviteText}>
              ส่งลิงก์นี้ให้ <strong>{users.find(u => u.id === inviteState.userId)?.name}</strong> เพื่อเชื่อมบัญชี LINE
            </p>
            <div className={s.inviteCodeBox}>
              <code className={s.inviteCode}>{inviteState.code}</code>
            </div>
            <div className={s.inviteActions}>
              <button className={s.copyBtn} onClick={handleCopyLink}>
                {inviteState.copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                {inviteState.copied ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}
              </button>
              <button className={s.sendLineBtn} onClick={handleSendLine}>
                ส่งผ่าน LINE
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdding && (
        <div className={s.addCard}>
          <AvatarUploader
            currentAvatar={formData.avatar}
            name={formData.name || '?'}
            color="#CCC"
            editable={true}
            onUpload={(base64) => setFormData({ ...formData, avatar: base64 })}
            size={50}
          />
          <div className={s.memberInfo}>
            <input
              className={s.nameInput}
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="ชื่อสมาชิกใหม่"
              autoFocus
            />
            <div className={s.roleRadios}>
              <label className={s.roleLabel}>
                <input
                  type="radio"
                  checked={formData.role === 'parent'}
                  onChange={() => setFormData({ ...formData, role: 'parent' })}
                />
                ผู้ปกครอง
              </label>
              <label className={s.roleLabel}>
                <input
                  type="radio"
                  checked={formData.role === 'child'}
                  onChange={() => setFormData({ ...formData, role: 'child' })}
                />
                ลูก
              </label>
            </div>
          </div>
          <div className={s.actions}>
            <button className={s.saveBtn} onClick={handleSave}>
              <Check size={18} />
            </button>
            <button className={s.cancelBtn} onClick={() => setIsAdding(false)}>
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {!isAdding && (
        <button className={s.addBtn} onClick={handleAdd}>
          <Plus size={20} />
          เพิ่มสมาชิกครอบครัว
        </button>
      )}
    </div>
  );
}