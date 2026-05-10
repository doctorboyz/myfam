'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  initLiff,
  isInClient,
  isLoggedIn,
  getIDToken,
  getProfile,
  login as liffLogin,
} from '@/lib/liff-auth';

interface LiffContextValue {
  isLiffReady: boolean;
  liffLogin: () => void;
}

const LiffContext = createContext<LiffContextValue>({
  isLiffReady: false,
  liffLogin: () => {},
});

export function useLiff() {
  return useContext(LiffContext);
}

export function LiffProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        setIsReady(true);
        return;
      }

      const ok = await initLiff();
      if (!ok || !mounted) {
        setIsReady(true);
        return;
      }

      const loggedIn = await isLoggedIn();

      if (loggedIn) {
        const idToken = await getIDToken();
        if (idToken && mounted) {
          try {
            await fetch('/api/auth/liff', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
              credentials: 'include',
            });
          } catch {
            // Auth failed silently — fallback to cookie auth
          }
        }
      } else {
        const inClient = await isInClient();
        if (inClient) {
          liffLogin();
        }
      }

      if (mounted) setIsReady(true);
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <LiffContext.Provider value={{ isLiffReady: isReady, liffLogin }}>
      {children}
    </LiffContext.Provider>
  );
}