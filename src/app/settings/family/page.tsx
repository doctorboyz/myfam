'use client';

import { useFinance } from '@/context/FinanceContext';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Check, Trash2, X } from 'lucide-react';
import AvatarUploader from '@/components/ImageUploader/AvatarUploader';
import { User, UserRole } from '@/types';
import s from './family.module.css';

export default function FamilyManagement() {
  const { users, currentUser, updateUser, addUser, removeUser } = useFinance();
  const router = useRouter();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({});

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
                  <button className={s.editBtn} onClick={() => handleEdit(user)}>
                    แก้ไข
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

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