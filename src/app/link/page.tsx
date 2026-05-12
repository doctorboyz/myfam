'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Check, UserPlus, MessageCircle, LogIn } from 'lucide-react';
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
  const code = searchParams.get('code');

  const [step, setStep] = useState<Step>('loading');
  const [lineProfile, setLineProfile] = useState<LineProfile | null>(null);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        // Get LIFF ID token
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          setStep('no-code');
          return;
        }

        const { initLiff, isLoggedIn, getIDToken, getProfile, isInClient } = await import('@/lib/liff-auth');
        const ok = await initLiff();
        if (!ok) {
          setStep('no-code');
          return;
        }

        const loggedIn = await isLoggedIn();
        if (!loggedIn) {
          const inClient = await isInClient();
          if (inClient) {
            // Inside LIFF — show login button so user can manually login
            setStep('needs-login');
          } else {
            // Outside LIFF — show no-code instructions
            setStep('no-code');
          }
          return;
        }

        const idToken = await getIDToken();
        if (!idToken) {
          setStep('no-code');
          return;
        }

        // Send ID token to auth endpoint
        const authRes = await fetch('/api/auth/liff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
          credentials: 'include',
        });

        const authData = await authRes.json();

        if (authData.success && authData.linked) {
          // Already linked, redirect to dashboard
          router.push('/dashboard');
          return;
        }

        if (authData.needsLinking && authData.lineProfile) {
          const profile = authData.lineProfile;
          setLineProfile(profile);

          // If we have a code, verify it and get invite info
          if (code) {
            // Verify the invite code to get the member name
            try {
              const invitesRes = await fetch('/api/invites', { credentials: 'include' });
              if (invitesRes.ok) {
                const invitesData = await invitesRes.json();
                const match = invitesData.invites?.find((inv: { code: string }) => inv.code === code.toUpperCase());
                if (match) {
                  setInviteInfo({ code: code.toUpperCase(), userName: match.userName });
                }
              }
            } catch {
              // If we can't verify the code, we'll still try to link
            }

            // Also get LINE profile from getProfile for avatar
            try {
              const liffProfile = await getProfile();
              if (liffProfile) {
                setLineProfile(prev => prev ? {
                  ...prev,
                  displayName: liffProfile.displayName || prev.displayName,
                  pictureUrl: liffProfile.pictureUrl || prev.pictureUrl,
                } : prev);
              }
            } catch {
              // Ignore profile fetch errors
            }

            setStep('confirm');
          } else {
            setStep('no-code');
          }
        } else {
          // Auth failed or unexpected response
          if (authData.success && authData.user) {
            router.push('/dashboard');
            return;
          }
          setStep('no-code');
        }
      } catch (err) {
        console.error('[link] Init error:', err);
        setStep('no-code');
      }
    }

    init();
  }, [code, router]);

  const handleLink = async () => {
    if (!code || !lineProfile) return;

    setIsLinking(true);
    setError('');

    try {
      const { getIDToken: getToken } = await import('@/lib/liff-auth');
      const idToken = await getToken();
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
        // Map error codes to Thai messages
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
    router.push('/dashboard');
  };

  const handleLogin = async () => {
    try {
      const { login } = await import('@/lib/liff-auth');
      // Preserve current URL (including ?code=...) so we come back here after LINE login
      const redirectUri = window.location.href;
      await login(redirectUri);
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