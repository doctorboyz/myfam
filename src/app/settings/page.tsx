"use client";

import { useFinance } from "@/context/FinanceContext";
import { ChevronRight, Settings, Users, Layers, HelpCircle } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const { currentUser } = useFinance();
  if (!currentUser) return <div style={{padding: 20}}>Loading...</div>;

  const isParent = currentUser.role === 'parent';

  return (
    <div style={{ padding: '20px', paddingBottom: '100px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Settings size={24} />
        App Settings
      </h2>

      {/* General Settings */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', color: 'var(--secondary-text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          General
        </h3>
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
           {/* Theme Toggle (Mock) */}
           <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
             <span style={{ fontSize: '15px' }}>Appearance</span>
             <span style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>Light</span>
           </div>
           {/* Language (Mock) */}
           <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
             <span style={{ fontSize: '15px' }}>Language</span>
             <span style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>English</span>
           </div>
        </div>
      </div>

      {/* Management (Parent Only) */}
      {isParent && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--secondary-text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Management
          </h3>
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <Link href="/categories" style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }}>
                <Layers size={20} style={{ marginRight: '12px', color: 'var(--primary)' }} />
                <span style={{ flex: 1, fontSize: '15px', color: 'var(--foreground)' }}>Categories</span>
                <ChevronRight size={18} color="var(--secondary-text)" />
            </Link>
            
            <Link href="/settings/family" style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', cursor: 'pointer' }}>
                <Users size={20} style={{ marginRight: '12px', color: 'var(--primary)' }} />
                <span style={{ flex: 1, fontSize: '15px', color: 'var(--foreground)' }}>Family Members</span>
                <ChevronRight size={18} color="var(--secondary-text)" />
            </Link>
          </div>
        </div>
      )}

      {/* About */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', color: 'var(--secondary-text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          About
        </h3>
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
           <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
             <HelpCircle size={20} style={{ marginRight: '12px', color: 'var(--primary)' }} />
             <span style={{ flex: 1, fontSize: '15px' }}>Help & Support</span>
             <ChevronRight size={18} color="var(--secondary-text)" />
           </div>
           
           <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
             <span style={{ fontSize: '15px' }}>Version</span>
             <span style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>1.0.0 (Beta)</span>
           </div>
        </div>
      </div>

    </div>
  );
}
