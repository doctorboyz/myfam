"use client";

import { useFinance } from "@/context/FinanceContext";
import AvatarUploader from "@/components/ImageUploader/AvatarUploader";
import { LogOut, Wallet, Shield, User } from 'lucide-react';
import Money from "@/components/Money/Money";

export default function Profile() {
  const { currentUser, accounts, updateUser, logout } = useFinance();
  
  if (!currentUser) return <div style={{padding: 20}}>Loading profile...</div>;

  // Get user's accounts
  const myAccounts = accounts.filter(a => a.owner === currentUser.name);

  const handleAvatarUpdate = (base64: string) => {
      updateUser(currentUser.id, { avatar: base64 });
  };

  return (
    <div style={{ padding: '20px', paddingBottom: '100px' }}>
      
      {/* Profile Header */}
      <div style={{
        background: 'var(--card-bg)',
        padding: '32px 20px',
        borderRadius: '24px',
        textAlign: 'center',
        marginBottom: '20px',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <AvatarUploader 
                currentAvatar={currentUser.avatar}
                name={currentUser.name}
                color={currentUser.color}
                onUpload={handleAvatarUpdate}
                editable={true}
                size={80}
            />
        </div>
        
        <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>{currentUser.name}</h2>
        
        <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '6px', 
            background: 'var(--bg)', 
            padding: '4px 12px', 
            borderRadius: '20px',
            marginTop: '8px'
        }}>
            {currentUser.role === 'parent' ? <Shield size={14} color="var(--primary)" /> : <User size={14} color="var(--primary)" />}
            <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--secondary-text)', textTransform: 'capitalize' }}>
                {currentUser.role} Account
            </span>
        </div>
      </div>
      
      {/* My Accounts Summary */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', paddingLeft: '4px' }}>My Accounts</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
            {myAccounts.length > 0 ? myAccounts.map(acc => (
                <div key={acc.id} style={{
                    background: 'var(--card-bg)',
                    padding: '16px',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid var(--border)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '12px',
                            background: acc.color + '20', color: acc.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Wallet size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: '500' }}>{acc.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>{acc.type}</div>
                        </div>
                    </div>
                    <div style={{ fontWeight: '600' }}>
                        <Money amount={acc.balance} />
                    </div>
                </div>
            )) : (
                <div style={{ color: 'var(--secondary-text)', textAlign: 'center', padding: '20px' }}>No accounts found.</div>
            )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ background: 'var(--card-bg)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <button style={{
          width: '100%',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: 'var(--danger)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '15px',
          fontWeight: '500'
        }}
        onClick={() => logout()}
        >
          <LogOut size={20} />
          Log Out
        </button>
      </div>

    </div>
  );
}
