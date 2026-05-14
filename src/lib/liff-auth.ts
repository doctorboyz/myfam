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

    // WORKAROUND: LIFF SDK v2.28.0 has a bug where addParamsToUrl returns
    // a URL object that gets stringified to "[object Object]" in the OAuth
    // redirectUri param, causing 400 Bad Request.
    // Also guards against accidental non-string args (e.g. React events).
    function patchLoginFn(target: any): any {
      if (!target || typeof target !== 'function') return target;
      const orig = target.bind(target);
      return function (options?: any) {
        const opts = options || {};
        if (!opts.redirectUri) {
          opts.redirectUri = window.location.href;
        } else if (typeof opts.redirectUri !== 'string') {
          const urlObj = opts.redirectUri;
          // Only coerce URL-like objects; reject React events / random objects
          if (urlObj.href || urlObj.url || urlObj instanceof URL) {
            opts.redirectUri = urlObj.href || urlObj.toString?.() || String(urlObj);
          } else {
            opts.redirectUri = window.location.href;
          }
        }
        return orig(opts);
      };
    }

    liff.login = patchLoginFn(liff.login);

    try {
      const loginMod = await import('@liff/login');
      (loginMod as any).login = patchLoginFn(loginMod.login);
      if (loginMod.default && loginMod.default.login) {
        (loginMod.default as any).login = patchLoginFn(loginMod.default.login);
      }
    } catch {
      // ignore — @liff/login may not be reachable in some bundles
    }

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
  if (redirectUri && typeof redirectUri === 'string') {
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