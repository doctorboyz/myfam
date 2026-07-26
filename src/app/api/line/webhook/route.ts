/**
 * LINE Webhook — inbound endpoint.
 *
 * The intent/OCR pipeline has been removed. This endpoint now only verifies
 * the LINE signature and acknowledges events. Outbound notifications
 * (sendLinePush in src/lib/line.ts) remain available for cron-driven reminders.
 */

import { NextResponse } from 'next/server';
import { verifyLineSignature } from '@/lib/line-verify';

export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    if (!channelSecret) {
      return NextResponse.json({ error: 'LINE_CHANNEL_SECRET not configured' }, { status: 500 });
    }

    const body = await request.text();
    const signature = request.headers.get('x-line-signature');

    if (!verifyLineSignature(body, signature, channelSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Acknowledge events. No inbound processing — the bot pipeline is retired.
    // Outbound notifications are sent via sendLinePush from other callers (cron).
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('LINE webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}