/**
 * LIFF SDK initialization and authentication helpers.
 *
 * Dynamic import avoids SSR issues with @line/liff (requires window).
 * Provides: init, ID token, access token, profile, and LIFF detection.
 */

let liffModule: import('@line/liff').Liff | null = null;

async function getLiff() {
  if (liffModule) return liffModule;
  const mod = await import('@line/liff');
  // Handle CJS/ESM interop: ESM has {default: liff}, CJS is liff itself
  liffModule = mod.default || mod;
  return liffModule;
}

let initialized = false;

export async function initLiff(): Promise<boolean> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) return false;

  try {
    const liff = await getLiff();
    await liff.init({ liffId, withLoginOnExternalBrowser: false });
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

export async function isLiffAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const liff = await getLiff();
    return typeof liff !== 'undefined';
  } catch {
    return false;
  }
}

export async function isInClient(): Promise<boolean> {
  if (!initialized) return false;
  const liff = await getLiff();
  return liff.isInClient();
}

export async function isLoggedIn(): Promise<boolean> {
  if (!initialized) return false;
  const liff = await getLiff();
  return liff.isLoggedIn();
}

export async function getIDToken(): Promise<string | null> {
  if (!initialized) return null;
  const liff = await getLiff();
  try {
    return liff.getIDToken();
  } catch {
    return null;
  }
}

export async function getProfile(): Promise<{
  userId: string;
  displayName: string;
  pictureUrl: string | null;
  statusMessage: string | null;
} | null> {
  if (!initialized) return null;
  const liff = await getLiff();
  try {
    const profile = await liff.getProfile();
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl ?? null,
      statusMessage: profile.statusMessage ?? null,
    };
  } catch {
    return null;
  }
}

export async function login(redirectUri?: string): Promise<void> {
  if (!initialized) return;
  const liff = await getLiff();
  if (redirectUri) {
    liff.login({ redirectUri });
  } else {
    liff.login();
  }
}

export async function logout(): Promise<void> {
  if (!initialized) return;
  const liff = await getLiff();
  liff.logout();
}

export async function closeWindow(): Promise<void> {
  if (!initialized) return;
  const liff = await getLiff();
  liff.closeWindow();
}

export async function sendMessages(messages: unknown[]): Promise<void> {
  if (!initialized) return;
  const liff = await getLiff();
  await liff.sendMessages(messages as Parameters<typeof liff.sendMessages>[0]);
}

export function isInitialized(): boolean {
  return initialized;
}