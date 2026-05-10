"use client";

import { useFinance } from "@/context/FinanceContext";
import { ChevronRight, Settings, Users, Layers, HelpCircle } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const { currentUser } = useFinance();
  if (!currentUser) return <div style={{padding: 20}}>กำลังโหลด...</div>;

  const isAdmin = currentUser.isAdmin;
  const isParent = currentUser.role === 'parent';

  return (
    <div style={{ padding: '20px', paddingBottom: '100px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Settings size={24} />
        ตั้งค่า
      </h2>

      {/* General Settings */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', color: 'var(--secondary-text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          ทั่วไป
        </h3>
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
           {/* Theme Toggle (Mock) */}
           <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
             <span style={{ fontSize: '15px' }}>ธีม</span>
             <span style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>สว่าง</span>
           </div>
           {/* Language (Mock) */}
           <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
             <span style={{ fontSize: '15px' }}>ภาษา</span>
             <span style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>ไทย</span>
           </div>
        </div>
      </div>

      {/* Management */}
      {(isAdmin || isParent) && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--secondary-text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            จัดการ
          </h3>
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            {isAdmin && (
              <Link href="/settings/categories" style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }}>
                  <Layers size={20} style={{ marginRight: '12px', color: 'var(--primary)' }} />
                  <span style={{ flex: 1, fontSize: '15px', color: 'var(--foreground)' }}>หมวดหมู่</span>
                  <ChevronRight size={18} color="var(--secondary-text)" />
              </Link>
            )}

            {isParent && (
              <Link href="/settings/family" style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', cursor: 'pointer' }}>
                  <Users size={20} style={{ marginRight: '12px', color: 'var(--primary)' }} />
                  <span style={{ flex: 1, fontSize: '15px', color: 'var(--foreground)' }}>สมาชิกครอบครัว</span>
                  <ChevronRight size={18} color="var(--secondary-text)" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* About */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', color: 'var(--secondary-text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          เกี่ยวกับ
        </h3>
        <div style={{ background: 'var(--card-bg)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
           <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
             <HelpCircle size={20} style={{ marginRight: '12px', color: 'var(--primary)' }} />
             <span style={{ flex: 1, fontSize: '15px' }}>ช่วยเหลือ</span>
             <ChevronRight size={18} color="var(--secondary-text)" />
           </div>
           
           <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
             <span style={{ fontSize: '15px' }}>เวอร์ชัน</span>
             <span style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>1.0.0 (Beta)</span>
           </div>
        </div>
      </div>

    </div>
  );
}
