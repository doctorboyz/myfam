'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Check, UserPlus, MessageCircle, LogIn } from 'lucide-react';
import { useLiff } from '@/context/LiffContext';
import s from './page.module.css';

type Step = 'loading' | 'needs-login' | 'confirm' | 'success' | 'error' | 'no-code';

interface LineProfile {
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
}

interface InviteInfo {
  code: string;
  userName: string;
}

function LinkPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isLiffReady, isLoggedIn: liffLoggedIn, isInClient: liffInClient, liffLogin, getIDToken, getProfile } = useLiff();
  const urlCode = searchParams.get('code');
  // Restore invite code from sessionStorage if it was stored before LIFF login redirect
  const code = urlCode || (typeof window !== 'undefined' ? sessionStorage.getItem('inviteCode') : null);

  const [step, setStep] = useState<Step>('loading');
  const [lineProfile, setLineProfile] = useState<LineProfile | null>(null);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    async function init() {
      if (!isLiffReady) return;

      try {
        if (!liffLoggedIn) {
          // If not logged in, just stay on this page and wait for user to click login
          // (Auto-triggering might be causing the 'jumping' to the app)
          setStep('needs-login');
          return;
        }

        const idToken = await getIDToken();
        if (!idToken) {
          setStep('needs-login');
          return;
        }

        // If we have an invite code, skip /api/auth/liff — don't auto-create.
        // Just show the confirm step and let the user bind via link-invite.
        if (code) {
          try {
            const res = await fetch(`/api/invites/\${code.toUpperCase()}`);
            if (res.ok) {
              const data = await res.json();
              setInviteInfo({ code: code.toUpperCase(), userName: data.userName });
            }
          } catch (err) {
            console.error('Verify invite failed', err);
          }

          try {
            const profile = await getProfile();
            if (profile) {
              setLineProfile({
                lineUserId: '',
                displayName: profile.displayName || null,
                pictureUrl: profile.pictureUrl || null,
              });
            }
          } catch {
            // Ignore profile fetch errors
          }

          setStep('confirm');
          return;
        }

        // No invite code — normal auth (auto-create if new)
        const authRes = await fetch('/api/auth/liff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
          credentials: 'include',
        });

        const authData = await authRes.json();

        if (authData.success && authData.linked) {
          sessionStorage.removeItem('inviteCode');
          router.push('/dashboard');
          return;
        }

        // Should not reach here because /api/auth/liff auto-creates,
        // but handle gracefully just in case.
        setStep('no-code');
      } catch (err) {
        console.error('[link] Init error:', err);
        setStep('no-code');
      }
    }

    init();
  }, [isLiffReady, liffLoggedIn, getIDToken, getProfile, code, router]);

  const handleLink = async () => {
    if (!code || !lineProfile) return;

    setIsLinking(true);
    setError('');

    try {
      const idToken = await getIDToken();
      if (!idToken) {
        setError('ไม่สามารถยืนยันตัวตน LINE ได้ กรุณาลองใหม่');
        setIsLinking(false);
        return;
      }

      const res = await fetch('/api/auth/liff/link-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, code: code.toUpperCase() }),
        credentials: 'include',
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStep('success');
      } else {
        const messages: Record<string, string> = {
          'LINE account already linked': 'บัญชี LINE นี้ลิงก์กับบัญชีอื่นแล้ว',
          'Invite code not found': 'ไม่พบรหัสเชิญ กรุณาขอรหัสใหม่',
          'Invite code already used': 'รหัสเชิญนี้ถูกใช้แล้ว',
          'Invite code expired': 'รหัสเชิญหมดอายุ กรุณาขอรหัสใหม่',
          'Target user already linked to another LINE account': 'บัญชีนี้ลิงก์กับ LINE อื่นแล้ว',
          'Too many attempts. Please try again later.': 'ลองหลายครั้งเกินไป กรุณารอสักครู่',
        };
        setError(messages[data.error] || data.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    } catch {
      setError('ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่');
    }

    setIsLinking(false);
  };

  const handleAddFriend = () => {
    const basicId = process.env.NEXT_PUBLIC_LINE_BASIC_ID;
    if (basicId) {
      window.location.href = `line://ti/p/@${basicId}`;
    }
  };

  const handleEnterApp = () => {
    sessionStorage.removeItem('inviteCode');
    router.push('/dashboard');
  };

  const handleLogin = async () => {
    try {
      if (code) {
        sessionStorage.setItem('inviteCode', code);
      }
      liffLogin();
    } catch {
      setError('ไม่สามารถเปิดหน้า login ได้');
    }
  };

  const displayName = lineProfile?.displayName || '...';
  const initial = displayName.charAt(0).toUpperCase();

  if (step === 'loading') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.loadingSpinner} />
          <p className={s.subtitle}>กำลังตรวจสอบ...</p>
        </div>
      </div>
    );
  }

  if (step === 'needs-login') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.avatar}>🤝</div>
          <h1 className={s.title}>เข้าสู่ระบบ LINE</h1>
          <p className={s.subtitle}>
            กรุณาเข้าสู่ระบบ LINE เพื่อดำเนินการเชื่อมบัญชี
          </p>
          {error && <p className={s.errorMessage}>{error}</p>}
          <div className={s.actions}>
            <button className={s.linkBtn} onClick={handleLogin}>
              <LogIn size={20} />
              เข้าสู่ระบบด้วย LINE
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.avatar}>
            {lineProfile?.pictureUrl ? (
              <img src={lineProfile.pictureUrl} alt="" className={s.avatarImg} />
            ) : (
              initial
            )}
          </div>

          <h1 className={s.title}>เชื่อมบัญชี LINE</h1>
          <p className={s.subtitle}>
            คุณต้องการเชื่อม LINE ของคุณ
            {inviteInfo && (
              <>กับบัญชี <span className={s.memberName}>{inviteInfo.userName}</span> ใน MyFam?</>
            )}
            {!inviteInfo && <>กับบัญชี MyFam?</>}
          </p>

          {error && <p className={s.errorMessage}>{error}</p>}

          <div className={s.actions}>
            <button className={s.linkBtn} onClick={handleLink} disabled={isLinking}>
              <UserPlus size={20} />
              {isLinking ? 'กำลังเชื่อมต่อ...' : 'เชื่อมบัญชี'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.successIcon}>
            <Check size={32} />
          </div>

          <h1 className={s.title}>เชื่อมบัญชีสำเร็จ!</h1>
          <p className={s.subtitle}>
            บัญชี LINE ของคุณเชื่อมกับ MyFam แล้ว
          </p>

          <div className={s.actions}>
            <button className={s.friendBtn} onClick={handleAddFriend}>
              <MessageCircle size={20} />
              เพิ่มเพื่อน LINE เพื่อรับการแจ้งเตือน
            </button>
            <button className={s.enterBtn} onClick={handleEnterApp}>
              <LogIn size={18} />
              เข้าสู่แอป
            </button>
          </div>
        </div>
      </div>
    );
  }

  // no-code or error state
  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.avatar}>{initial}</div>
        <h1 className={s.title}>ยังไม่ได้เชื่อมบัญชี</h1>
        <p className={s.subtitle}>
          กรุณาขอลิงก์เชื่อมต่อจากผู้ปกครอง
          <br />
          ผู้ปกครองสามารถสร้างลิงก์เชิญได้จาก
          <br />
          <strong>การตั้งค่า &gt; สมาชิกครอบครัว</strong> ในแอป MyFam
        </p>
      </div>
    </div>
  );
}

export default function LinkPage() {
  return (
    <Suspense fallback={
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.loadingSpinner} />
          <p className={s.subtitle}>กำลังตรวจสอบ...</p>
        </div>
      </div>
    }>
      <LinkPageContent />
    </Suspense>
  );
}