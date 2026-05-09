/**
 * LINE webhook signature verification.
 * Validates that incoming webhook requests are genuinely from LINE.
 */

import crypto from 'crypto';

/**
 * Verify the X-Line-Signature header of a LINE webhook request.
 *
 * LINE signs the request body with HMAC-SHA256 using the Channel Secret.
 * This function recomputes the signature and compares it with timing-safe equality
 * to prevent timing attacks.
 *
 * @param body - Raw request body as a string (NOT parsed JSON)
 * @param signature - Value of the X-Line-Signature header
 * @param channelSecret - LINE Channel Secret from environment
 * @returns true if signature is valid, false otherwise
 */
export function verifyLineSignature(
  body: string,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature) return false;

  const expected = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    // Length mismatch between buffers
    return false;
  }
}