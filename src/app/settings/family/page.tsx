"use client";

import { useFinance } from "@/context/FinanceContext";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Check, Trash2, X } from 'lucide-react';
import AvatarUploader from "@/components/ImageUploader/AvatarUploader";
import { User, UserRole } from "@/types";

export default function FamilyManagement() {
  const { users, currentUser, updateUser, addUser, removeUser } = useFinance();
  const router = useRouter();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  // State for new user / editing user
  const [formData, setFormData] = useState<Partial<User>>({});

  // Protect route
  if (!currentUser) return <div style={{padding: 20, textAlign: 'center'}}>Loading...</div>;

  if (currentUser.role !== 'parent') {
      return (
          <div style={{ padding: '20px', textAlign: 'center' }}>
              <h2>Access Denied</h2>
              <p>Only parents can manage family members.</p>
              <button onClick={() => router.back()} style={{ marginTop: '20px' }}>Go Back</button>
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
      setFormData({
          name: '',
          role: 'child',
          color: '#GRAY', 
          avatar: ''
      });
  };

  const handleSave = () => {
      if (!formData.name) return;

      if (isAdding) {
          const newUser: Omit<User, 'familyId'> & { familyId?: string } = {
              id: Date.now().toString(),
              name: formData.name,
              role: formData.role as UserRole || 'child',
              color: '#' + Math.floor(Math.random()*16777215).toString(16), // Random color
              avatar: formData.avatar,
              familyId: currentUser?.familyId || ''
          };
          addUser(newUser as User);
      } else if (editingId) {
          updateUser(editingId, formData);
      }

      setEditingId(null);
      setIsAdding(false);
  };

  const handleDelete = (id: string) => {
      if (confirm("Are you sure you want to remove this family member?")) {
          removeUser(id);
      }
  };

  return (
    <div style={{ padding: '20px', paddingBottom: '100px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <ChevronLeft size={24} />
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Family Members</h2>
      </header>

      <div style={{ display: 'grid', gap: '16px' }}>
          {users.map(user => {
              const isEditing = editingId === user.id;

              return (
                  <div key={user.id} style={{ 
                      background: 'var(--card-bg)', 
                      borderRadius: '16px', 
                      padding: '16px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '16px',
                      border: isEditing ? '2px solid var(--primary)' : '1px solid var(--border)' 
                  }}>
                      {/* Avatar */}
                      <AvatarUploader 
                          currentAvatar={isEditing ? formData.avatar : user.avatar}
                          name={isEditing && formData.name ? formData.name : user.name}
                          color={user.color}
                          editable={isEditing}
                          onUpload={(base64) => setFormData({ ...formData, avatar: base64 })}
                          size={50}
                      />

                      <div style={{ flex: 1 }}>
                          {isEditing ? (
                              <input 
                                  value={formData.name || ''}
                                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                  placeholder="Name"
                                  style={{
                                      width: '100%',
                                      padding: '8px',
                                      borderRadius: '8px',
                                      border: '1px solid var(--border)',
                                      marginBottom: '4px',
                                      fontSize: '15px'
                                  }}
                              />
                          ) : (
                              <div style={{ fontSize: '16px', fontWeight: '600' }}>{user.name}</div>
                          )}

                          {isEditing ? (
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                  <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <input 
                                          type="radio" 
                                          checked={formData.role === 'parent'} 
                                          onChange={() => setFormData({ ...formData, role: 'parent' })}
                                      /> Parent
                                  </label>
                                  <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <input 
                                          type="radio" 
                                          checked={formData.role === 'child'} 
                                          onChange={() => setFormData({ ...formData, role: 'child' })}
                                      /> Child
                                  </label>
                              </div>
                          ) : (
                              <div style={{ fontSize: '13px', color: 'var(--secondary-text)', textTransform: 'capitalize' }}>
                                  {user.role}
                              </div>
                          )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {isEditing ? (
                              <>
                                  <button onClick={handleSave} style={{ background: 'var(--primary)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }}>
                                      <Check size={18} />
                                  </button>
                                  <button onClick={() => setEditingId(null)} style={{ background: 'var(--hover-bg)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary-text)', cursor: 'pointer' }}>
                                      <X size={18} />
                                  </button>
                                  <button onClick={() => handleDelete(user.id)} style={{ background: '#FF3B3020', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', cursor: 'pointer' }} aria-label="Delete User">
                                      <Trash2 size={16} />
                                  </button>
                              </>
                          ) : (
                              <button onClick={() => handleEdit(user)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer' }}>
                                  Edit
                              </button>
                          )}
                      </div>
                  </div>
              );
          })}
      </div>

      {isAdding && (
          <div style={{ 
              background: 'var(--card-bg)', 
              borderRadius: '16px', 
              padding: '16px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '16px',
              border: '2px solid var(--primary)',
              marginTop: '16px' 
          }}>
              <AvatarUploader 
                  currentAvatar={formData.avatar}
                  name={formData.name || '?'}
                  color="#CCC"
                  editable={true}
                  onUpload={(base64) => setFormData({ ...formData, avatar: base64 })}
                  size={50}
              />
              <div style={{ flex: 1 }}>
                  <input 
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="New Member Name"
                      autoFocus
                      style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          marginBottom: '4px',
                          fontSize: '15px'
                      }}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input 
                              type="radio" 
                              checked={formData.role === 'parent'} 
                              onChange={() => setFormData({ ...formData, role: 'parent' })}
                          /> Parent
                      </label>
                      <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input 
                              type="radio" 
                              checked={formData.role === 'child'} 
                              onChange={() => setFormData({ ...formData, role: 'child' })}
                          /> Child
                      </label>
                  </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button onClick={handleSave} style={{ background: 'var(--primary)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }}>
                      <Check size={18} />
                  </button>
                  <button onClick={() => setIsAdding(false)} style={{ background: 'var(--hover-bg)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary-text)', cursor: 'pointer' }}>
                      <X size={18} />
                  </button>
              </div>
          </div>
      )}

      {!isAdding && (
          <button 
              onClick={handleAdd}
              style={{
                  width: '100%',
                  marginTop: '20px',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '2px dashed var(--border)',
                  background: 'none',
                  color: 'var(--secondary-text)',
                  fontSize: '15px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer'
              }}
          >
              <Plus size={20} />
              Add Family Member
          </button>
      )}

    </div>
  );
}
