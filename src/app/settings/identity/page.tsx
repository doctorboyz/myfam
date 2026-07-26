'use client';

import { useFinance } from '@/context/FinanceContext';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Save, Sparkles, RotateCcw } from 'lucide-react';
import s from './identity.module.css';

interface IdentityFields {
  roleContext: string;
  goals: string;
  style: string;
  customNotes: string;
}

const STYLE_OPTIONS = [
  { value: 'warm', label: '😊 เป็นกันเอง' },
  { value: 'data_driven', label: '📊 เน้นข้อมูล' },
  { value: 'concise', label: '⚡ สั้นกระชับ' },
  { value: 'playful', label: '🎮 สนุกสนาน' },
];

const PRESET_PLACEHOLDERS: Record<string, IdentityFields> = {
  parent: {
    roleContext: 'คุณพ่อ/คุณแม่ ดูแลเรื่องเงินของครอบครัว',
    goals: 'สอนให้ลูกบริหารเงินเป็น สร้างวินัยการออม',
    style: 'warm',
    customNotes: '',
  },
  child: {
    roleContext: 'กำลังเรียนรู้เรื่องการเงิน อยากเก่งเรื่องการออม',
    goals: 'เก็บเงินให้ถึงเป้า รู้ว่าควรใช้เงินกับอะไร',
    style: 'warm',
    customNotes: '',
  },
};

export default function IdentitySettings() {
  const { currentUser } = useFinance();
  const router = useRouter();
  const [fields, setFields] = useState<IdentityFields>({
    roleContext: '',
    goals: '',
    style: 'warm',
    customNotes: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/users/identity')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.identity) {
          setFields({
            roleContext: data.identity.roleContext || '',
            goals: data.identity.goals || '',
            style: data.identity.style || 'warm',
            customNotes: data.identity.customNotes || '',
          });
        } else if (currentUser) {
          // Use preset as default
          const preset = PRESET_PLACEHOLDERS[currentUser.role] || PRESET_PLACEHOLDERS.child;
          setFields(preset);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentUser]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/users/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: fields }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silent
    }
    setSaving(false);
  };

  const handleReset = () => {
    if (!currentUser) return;
    const preset = PRESET_PLACEHOLDERS[currentUser.role] || PRESET_PLACEHOLDERS.child;
    setFields(preset);
  };

  if (!currentUser || loading) return <div className={s.page}>กำลังโหลด...</div>;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.back()}>
          <ChevronLeft size={24} />
        </button>
        <h2 className={s.title}>ข้อมูลสำหรับ AI</h2>
      </header>

      <p className={s.desc}>
        ข้อมูลนี้จะช่วยให้ MyFam Bot เข้าใจคุณมากขึ้น และตอบคำถามได้ตรงใจยิ่งขึ้น
        คุณเป็นใคร เป้าหมายการเงินคืออะไร อยากให้บอทคุยกับคุณแบบไหน
      </p>

      <div className={s.form}>
        <label className={s.field}>
          <span className={s.fieldLabel}>บทบาทของคุณ</span>
          <textarea
            className={s.textarea}
            value={fields.roleContext}
            onChange={(e) => setFields({ ...fields, roleContext: e.target.value })}
            placeholder={PRESET_PLACEHOLDERS[currentUser.role]?.roleContext || ''}
            rows={2}
            maxLength={200}
          />
        </label>

        <label className={s.field}>
          <span className={s.fieldLabel}>เป้าหมายการเงิน</span>
          <textarea
            className={s.textarea}
            value={fields.goals}
            onChange={(e) => setFields({ ...fields, goals: e.target.value })}
            placeholder={PRESET_PLACEHOLDERS[currentUser.role]?.goals || ''}
            rows={2}
            maxLength={200}
          />
        </label>

        <label className={s.field}>
          <span className={s.fieldLabel}>สไตล์การคุย</span>
          <div className={s.styleOptions}>
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`${s.styleBtn} ${fields.style === opt.value ? s.styleBtnActive : ''}`}
                onClick={() => setFields({ ...fields, style: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </label>

        <label className={s.field}>
          <span className={s.fieldLabel}>ข้อมูลเพิ่มเติม</span>
          <textarea
            className={s.textarea}
            value={fields.customNotes}
            onChange={(e) => setFields({ ...fields, customNotes: e.target.value })}
            placeholder="อะไรก็ได้ที่อยากให้บอทรู้ — เช่น จำนวนลูก อายุ หรืองานอดิเรก"
            rows={3}
            maxLength={500}
          />
        </label>
      </div>

      <div className={s.actions}>
        <button className={s.resetBtn} onClick={handleReset}>
          <RotateCcw size={16} />
          ใช้ค่าเริ่มต้น
        </button>
        <button className={s.saveBtn} onClick={handleSave} disabled={saving}>
          {saved ? (
            <>✅ บันทึกแล้ว</>
          ) : (
            <>
              <Save size={16} />
              บันทึก
            </>
          )}
        </button>
      </div>
    </div>
  );
}
