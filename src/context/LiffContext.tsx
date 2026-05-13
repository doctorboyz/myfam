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
  isLoggedIn: boolean;
  isInClient: boolean;
  getIDToken: () => Promise<string | null>;
  getProfile: () => Promise<{ userId: string; displayName: string; pictureUrl: string | null; statusMessage: string | null; } | null>;
}

const LiffContext = createContext<LiffContextValue>({
  isLiffReady: false,
  liffLogin: () => {},
  isLoggedIn: false,
  isInClient: false,
  getIDToken: async () => null,
  getProfile: async () => null,
});

export function useLiff() {
  return useContext(LiffContext);
}

export function LiffProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [inClient, setInClient] = useState(false);

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

      const _loggedIn = await isLoggedIn();
      const _inClient = await isInClient();

      if (mounted) {
        setLoggedIn(_loggedIn);
        setInClient(_inClient);
      }

      // Mark LIFF environment via CSS variables (works in production build)
      if (_inClient) {
        document.documentElement.style.setProperty('--liff-header-height', '48px');
        document.documentElement.style.setProperty('--liff-extra-bottom', '16px');
      }

      // On /link page, let the page handle its own LIFF auth flow
      const isLinkPage = typeof window !== 'undefined' && window.location.pathname === '/link';

      if (_loggedIn) {
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
      } else if (_inClient && !isLinkPage) {
        // Auto-login on other pages, but let /link handle its own flow
        liffLogin();
      }

      if (mounted) setIsReady(true);
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <LiffContext.Provider value={{ isLiffReady: isReady, liffLogin, isLoggedIn: loggedIn, isInClient: inClient, getIDToken, getProfile }}>
      {children}
    </LiffContext.Provider>
  );
}