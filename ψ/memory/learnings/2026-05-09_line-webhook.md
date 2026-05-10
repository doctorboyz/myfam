---
name: line-webhook-lesson
description: LINE Bot integration patterns — reply+push, signature verification, fuzzy commands, pending transactions
type: project
---

# LINE Bot Integration Lessons

**Date**: 2026-05-09
**Context**: MyFam LINE Bot with AI-powered transaction creation

## Critical: LINE Secret Truncation

When manually copying secrets between .env files, a single character truncation (missing trailing `f` in LINE_CHANNEL_SECRET) caused silent 403 errors. **Always verify secrets byte-for-byte** — use `wc -c` to check length or `diff` between files.

## LINE Webhook Verification Requires GET Handler

LINE Developers Console "Verify" button sends a GET request first. Without a GET handler returning 200, verification fails with 403. Add:
```typescript
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

## Reply Token Expires in 30 Seconds

LINE reply tokens expire in 30 seconds. AI processing (especially OCR with cloud models) can take longer. **Pattern**: reply "⏳ processing..." immediately, then push the actual result via `sendLinePush()`. This prevents timeout errors.

## Fuzzy Command Matching for Thai

Thai users abbreviate commands: "ดูยอ" instead of "ดูยอด". Remove `^...$` anchors from regex patterns and use partial matching. This significantly improves UX.

## Pending Transaction for Uncertain Types

When AI can't determine expense vs income, create transaction with `status: 'pending'` and show Quick Reply confirm buttons. When user confirms, update type and status to `'completed'`, then adjust account balance.

## Docker Container Labels Reveal Deployment Source

When multiple repos exist, check `docker inspect` labels to find which folder the container runs from: `com.docker.compose.project.working_dir`.

**Why**: Prevents confusion about which code is actually deployed.
**How to apply**: Always verify deployment source before assuming which folder is active.