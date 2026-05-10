'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  initLiff,
  isInClient,
  isLoggedIn,
  getIDToken,
  getProfile,
  login as liffLogin,
  logout as liffLogout,
} from '@/lib/liff-auth';

interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl: string | null;
  statusMessage: string | null;
}

interface LiffContextValue {
  isLiff: boolean;
  isInClient: boolean;
  isLiffReady: boolean;
  isLiffLoggedIn: boolean;
  lineProfile: LineProfile | null;
  liffLogin: () => void;
  liffLogout: () => void;
  needsLinking: boolean;
}

const LiffContext = createContext<LiffContextValue>({
  isLiff: false,
  isInClient: false,
  isLiffReady: false,
  isLiffLoggedIn: false,
  lineProfile: null,
  liffLogin: () => {},
  liffLogout: () => {},
  needsLinking: false,
});

export function useLiff() {
  return useContext(LiffContext);
}

export function LiffProvider({ children }: { children: ReactNode }) {
  const [isLiff, setIsLiff] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLiffLoggedIn, setIsLiffLoggedIn] = useState(false);
  const [lineProfile, setLineProfile] = useState<LineProfile | null>(null);
  const [needsLinking, setNeedsLinking] = useState(false);

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

      const inClient = await isInClient();
      if (mounted) {
        setIsLiff(inClient);
        setIsClient(inClient);
      }

      const loggedIn = await isLoggedIn();
      if (mounted) setIsLiffLoggedIn(loggedIn);

      if (loggedIn) {
        const profile = await getProfile();
        if (mounted && profile) {
          setLineProfile(profile);
        }

        // Auto-authenticate with LINE ID token
        const idToken = await getIDToken();
        if (idToken && mounted) {
          try {
            const res = await fetch('/api/auth/liff', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
              credentials: 'include',
            });

            if (res.ok) {
              const data = await res.json();
              if (data.needsLinking) {
                setNeedsLinking(true);
              }
            }
          } catch {
            // Auth failed silently — fallback to cookie auth
          }
        }
      } else if (inClient) {
        // Inside LINE but somehow not logged in — should not happen normally
        // Try login which will redirect
        liffLogin();
      }

      if (mounted) setIsReady(true);
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  const value: LiffContextValue = {
    isLiff,
    isInClient: isClient,
    isLiffReady: isReady,
    isLiffLoggedIn,
    lineProfile,
    liffLogin,
    liffLogout,
    needsLinking,
  };

  return (
    <LiffContext.Provider value={value}>
      {children}
    </LiffContext.Provider>
  );
}