export const maxDuration = 300; // 5 min for OCR inference on CPU

/**
 * POST /api/line/sandbox
 *
 * Sandbox endpoint for testing the AI pipeline without LINE webhook.
 * Accepts text or image and returns extracted transaction data + reply message.
 *
 * Request body:
 *   { type: 'text', text: 'ซื้อข้าว 85 บาท', userId: '<myfam-user-id>' }
 *   { type: 'image', imageBase64: '<base64>', userId: '<myfam-user-id>' }
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractFromText, extractFromSlip, formatConfirmationMessage, formatErrorMessage, type ExtractedTransaction } from '@/lib/ollama';

interface SandboxTextRequest {
  type: 'text';
  text: string;
  userId: string;
}

interface SandboxImageRequest {
  type: 'image';
  imageBase64: string;
  userId: string;
}

type SandboxRequest = SandboxTextRequest | SandboxImageRequest;

/**
 * Get data scope filter based on user role.
 * - child: can only access their own data
 * - parent: can access all family members' data
 */
function getDataScope(user: { id: string; role: string; familyId: string }) {
  if (user.role === 'parent') {
    return { createdBy: { familyId: user.familyId } };
  }
  return { createdById: user.id };
}

/**
 * Find the user's default account for transaction creation.
 * Single-item only: returns first active account.
 */
async function findDefaultAccount(userId: string) {
  return prisma.account.findFirst({
    where: { ownerId: userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Fetch categories available to the user's family.
 */
async function getCategoriesForFamily(familyId: string) {
  const users = await prisma.user.findMany({
    where: { familyId },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  return prisma.category.findMany({
    where: {
      OR: [
        { userId: null }, // System categories
        { userId: { in: userIds } }, // Family custom categories
      ],
    },
    include: { group: true },
  });
}

/**
 * Create a transaction from extracted data.
 * Uses the same pattern as POST /api/transactions with prisma.$transaction.
 * Single-item only: creates one transaction at a time.
 */
async function createTransactionFromExtracted(
  extracted: ExtractedTransaction,
  user: { id: string; role: string; familyId: string },
) {
  const account = await findDefaultAccount(user.id);
  if (!account) {
    throw new Error('User has no active account');
  }

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        amount: extracted.amount,
        date: new Date(extracted.date),
        type: extracted.type,
        description: extracted.description,
        status: 'completed',
        accountId: account.id,
        categoryId: extracted.categoryId,
        createdById: user.id,
        tags: ['line-bot'],
        fee: 0,
      },
      include: {
        category: { include: { group: true } },
        account: true,
        toAccount: true,
      },
    });

    // Adjust account balance (same pattern as POST /api/transactions)
    const amount = extracted.amount;
    if (extracted.type === 'income') {
      await tx.account.update({
        where: { id: account.id },
        data: { balance: { increment: amount } },
      });
    } else {
      await tx.account.update({
        where: { id: account.id },
        data: { balance: { decrement: amount } },
      });
    }

    return transaction;
  });
}

export async function POST(request: Request) {
  try {
    const body: SandboxRequest = await request.json();

    // Validate request
    if (!body.type || !body.userId) {
      return NextResponse.json(
        { error: 'Missing required fields: type, userId' },
        { status: 400 },
      );
    }

    if (body.type !== 'text' && body.type !== 'image') {
      return NextResponse.json(
        { error: 'Invalid type. Use "text" or "image".' },
        { status: 400 },
      );
    }

    // Resolve user — sandbox uses userId directly (no LINE mapping needed)
    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, name: true, role: true, familyId: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 },
      );
    }
    console.log(`[sandbox] found user ${user.name} (${user.role})`);

    // Fetch categories for the user's family
    const categories = await getCategoriesForFamily(user.familyId);
    const categoryContext = categories.map((c) => ({
      id: c.id,
      name: c.name,
      groupName: c.group.name,
      groupType: c.group.type,
    }));

    let extracted: ExtractedTransaction;
    let rawAiResponse: string | undefined;

    if (body.type === 'text') {
      if (!body.text) {
        return NextResponse.json(
          { error: 'Missing text field for text type' },
          { status: 400 },
        );
      }

      extracted = await extractFromText(body.text, categoryContext);
    } else {
      // Image type
      if (!body.imageBase64) {
        return NextResponse.json(
          { error: 'Missing imageBase64 field for image type' },
          { status: 400 },
        );
      }

      extracted = await extractFromSlip(body.imageBase64, categoryContext);
    }

    // Validate extraction confidence
    if (extracted.amount === 0 && extracted.confidence < 0.3) {
      return NextResponse.json({
        success: false,
        error: 'Could not extract transaction data. Please provide more details.',
        extracted,
      });
    }

    // Role-based scope check
    const scope = getDataScope(user);

    // Create transaction (single item only)
    const transaction = await createTransactionFromExtracted(extracted, user);

    // Format reply message
    const replyText = formatConfirmationMessage(transaction, extracted);

    return NextResponse.json({
      success: true,
      parsed: extracted,
      transaction: {
        id: transaction.id,
        amount: Number(transaction.amount),
        type: transaction.type,
        description: transaction.description,
        date: transaction.date,
        category: transaction.category?.name ?? null,
        categoryGroup: transaction.category?.group?.name ?? null,
        account: transaction.account?.name ?? 'Unknown',
      },
      lineReplySent: replyText,
      scope,
    });
  } catch (error) {
    console.error('Sandbox error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const thaiMessage = formatErrorMessage(message);

    return NextResponse.json(
      {
        success: false,
        error: message,
        thaiMessage,
      },
      { status: 500 },
    );
  }
}