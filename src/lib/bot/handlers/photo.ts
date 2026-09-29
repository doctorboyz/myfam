/**
 * Photo (slip/receipt) message handler.
 * Download → hash → duplicate check → vision extraction → confirm flow.
 * Degrades gracefully when the slip feature is disabled (kill switch)
 * or vision fails — the user can always type the transaction instead.
 */

import { prisma } from '@/lib/prisma';
import { downloadPhoto } from '@/lib/telegram/client';
import type { BotSender } from '@/lib/telegram/types';
import { extractFromSlip, isSlipEnabled } from '../extract-slip';
import { validateExtracted } from '../extract';
import { formatErrorMessage, truncateMessage, formatConfirmationPrompt } from '../format';
import { confirmKeyboard, menuKeyboard } from '../keyboards';
import {
  findSimilarTransactions,
  getCategoriesForFamily,
  getCategoryContext,
  getDataScope,
  hashImageBuffer,
  type BotUser,
} from '../record';
import { incrementFailure } from '../session';
import { storePendingExtraction } from './confirm';

/** Entry point for a photo message from a linked user. */
export async function handlePhotoMessage(
  user: BotUser,
  sender: BotSender,
  photoFileId: string,
  prefetchedBuffer?: Buffer,
): Promise<void> {
  if (!isSlipEnabled()) {
    await sender(
      '📸 อ่านสลิปยังไม่เปิดใช้งาน\nพิมพ์รายการแทนได้เลย เช่น "ซื้อข้าวผัด 85 บาท"',
      menuKeyboard(),
    );
    return;
  }

  try {
    // 1. Get the image bytes (sandbox passes the buffer directly — no download)
    const buffer = prefetchedBuffer ?? (await downloadPhoto(photoFileId));
    const imageHash = hashImageBuffer(buffer);
    const imageBase64 = buffer.toString('base64');

    // 2. Duplicate check — same slip already recorded?
    const duplicate = await prisma.transaction.findFirst({
      where: { ...getDataScope(user), imageHash, deletedAt: null },
      select: { description: true, amount: true, date: true },
    });
    if (duplicate) {
      const dt = new Intl.DateTimeFormat('th-TH', {
        day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok',
      }).format(duplicate.date);
      await sender(
        `⚠️ สลิปนี้บันทึกไปแล้ว\n📝 ${duplicate.description || '-'} ${Number(duplicate.amount)} บาท (${dt})\n\nถ้าต้องการบันทึกซ้ำจริง ๆ พิมพ์รายการด้วยตัวเองได้เลย`,
        menuKeyboard(),
      );
      return;
    }

    // 3. Vision extraction
    const categories = getCategoryContext(await getCategoriesForFamily(user.familyId));
    const extracted = await extractFromSlip(imageBase64, categories);

    const validation = validateExtracted(extracted);
    if (!validation.valid) {
      const failHint = await incrementFailure(user.id);
      await sender(`${validation.message}\n\nพิมพ์รายการแทนได้เลย เช่น "ซื้อข้าวผัด 85 บาท"${failHint}`, menuKeyboard());
      return;
    }

    // 4. Show confirmation (slip stays in the session payload for the save)
    const similar = await findSimilarTransactions(extracted, getDataScope(user));
    await storePendingExtraction(user, sender, extracted, similar.length, {
      imageBase64,
      imageHash,
    });
  } catch (error) {
    console.error('[PhotoHandler] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failHint = await incrementFailure(user.id);
    await sender(
      truncateMessage(`${formatErrorMessage(message)}\n\nพิมพ์รายการแทนได้เลย เช่น "ซื้อข้าวผัด 85 บาท"`) + failHint,
      confirmKeyboard(),
    );
  }
}

/** Exported for tests — stores extraction without downloading. */
export async function storeSlipExtraction(
  user: BotUser,
  sender: BotSender,
  extracted: Parameters<typeof storePendingExtraction>[2],
  imageBase64: string,
  imageHash: string,
): Promise<void> {
  const similar = await findSimilarTransactions(extracted, getDataScope(user));
  await storePendingExtraction(user, sender, extracted, similar.length, {
    imageBase64,
    imageHash,
  });
}