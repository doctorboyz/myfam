/**
 * Shared LINE ID Token verification utility.
 * Used by /api/auth/liff and /api/auth/liff/link-invite endpoints.
 */

export interface LineIdTokenPayload {
  sub: string; // LINE userId
  name?: string;
  picture?: string;
  aud: string;
  exp: number;
  iss: string;
}

export async function verifyLineIdToken(idToken: string): Promise<LineIdTokenPayload | null> {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) {
    console.error('[line-id-token] LINE_CHANNEL_ID not configured');
    return null;
  }

  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id_token=${encodeURIComponent(idToken)}&client_id=${encodeURIComponent(channelId)}`,
    });

    if (!res.ok) {
      console.error('[line-id-token] LINE verify failed:', res.status);
      return null;
    }

    const payload: LineIdTokenPayload = await res.json();

    if (payload.exp && Date.now() / 1000 > payload.exp) {
      console.error('[line-id-token] ID token expired');
      return null;
    }

    return payload;
  } catch (err) {
    console.error('[line-id-token] Verify error:', err);
    return null;
  }
}