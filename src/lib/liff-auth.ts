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
    // The SDK's init module imports @liff/login directly (b.login) which is
    // a DIFFERENT function reference from liff.login, so we must patch both.
    function patchLoginFn(target: any, name: string): any {
      if (!target || typeof target !== 'function') return target;
      const orig = target.bind(target);
      return function (options?: any) {
        const opts = options || {};
        if (!opts.redirectUri) {
          opts.redirectUri = window.location.href;
        } else if (typeof opts.redirectUri !== 'string') {
          const urlObj = opts.redirectUri;
          const keys = Object.keys(urlObj);
          console.log('[liff-auth] DEBUG keys:', keys);
          for (const k of keys.slice(0, 10)) {
            try {
              console.log('[liff-auth] DEBUG', k, ':', urlObj[k]);
            } catch {
              console.log('[liff-auth] DEBUG', k, ': [getter error]');
            }
          }
          // Try known URL-like properties and fallback to JSON
          opts.redirectUri = urlObj.href || urlObj.url || urlObj.toString?.() || urlObj.valueOf?.() || JSON.stringify(urlObj);
        }
        console.log('[liff-auth] login called with redirectUri:', opts.redirectUri);
        return orig(opts);
      };
    }

    liff.login = patchLoginFn(liff.login, 'liff.login');
    console.log('[liff-auth] liff.login patched');

    try {
      // Use webpackIgnore to bypass bundler and load the actual runtime module
      // that @liff/init uses internally. Without this, Turbopack bundles a
      // separate copy that our patch never reaches.
      const loginMod = await import(/* webpackIgnore: true */ '@liff/login');
      console.log('[liff-auth] @liff/login loaded, login type:', typeof loginMod.login);
      (loginMod as any).login = patchLoginFn(loginMod.login, 'loginMod.login');
      if (loginMod.default && loginMod.default.login) {
        (loginMod.default as any).login = patchLoginFn(loginMod.default.login, 'loginMod.default.login');
      }
    } catch (e) {
      console.log('[liff-auth] @liff/login import failed:', (e as Error).message);
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