/**
 * LINE Messaging API client.
 * Handles reply, push, and image download via LINE's Bot API.
 */

const LINE_API_BASE = 'https://api.line.me/v2/bot';
const LINE_DATA_BASE = 'https://api-data.line.me/v2/bot';

/**
 * Send a reply message using a reply token (valid for 30 seconds).
 * Each reply token can only be used once.
 * Optionally includes Quick Reply buttons.
 */
export async function sendLineReply(
  replyToken: string,
  text: string,
  quickReply?: { type: 'quickReply'; items: Array<{ type: 'action'; action: { type: 'message'; label: string; text: string } }> },
): Promise<void> {
  const message: Record<string, unknown> = { type: 'text', text };
  if (quickReply) {
    message.quickReply = quickReply;
  }

  const response = await fetch(`${LINE_API_BASE}/message/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [message],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('LINE reply error:', response.status, errorText);
    throw new Error(`LINE reply error (${response.status}): ${errorText}`);
  }
}

/**
 * Send a push message to a user (no time limit, but costs quota).
 * Optionally includes Quick Reply buttons.
 */
export async function sendLinePush(
  to: string,
  text: string,
  quickReply?: { type: 'quickReply'; items: Array<{ type: 'action'; action: { type: 'message'; label: string; text: string } }> },
): Promise<void> {
  const message: Record<string, unknown> = { type: 'text', text };
  if (quickReply) {
    message.quickReply = quickReply;
  }

  const response = await fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to,
      messages: [message],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('LINE push error:', response.status, errorText);
    throw new Error(`LINE push error (${response.status}): ${errorText}`);
  }
}

/**
 * Download an image sent by a user from LINE Content API.
 * Images are auto-deleted by LINE after a certain period — download promptly.
 */
export async function downloadLineImage(messageId: string): Promise<Buffer> {
  const response = await fetch(
    `${LINE_DATA_BASE}/message/${messageId}/content`,
    {
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE image download error (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Send a Flex Message (rich layout) via reply token.
 */
export async function sendLineFlexReply(
  replyToken: string,
  altText: string,
  contents: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${LINE_API_BASE}/message/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: 'flex',
          altText,
          contents,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('LINE flex reply error:', response.status, errorText);
    throw new Error(`LINE flex reply error (${response.status}): ${errorText}`);
  }
}