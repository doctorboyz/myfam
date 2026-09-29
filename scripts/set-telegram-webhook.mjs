#!/usr/bin/env node
/**
 * Set the Telegram webhook for the MyFam bot (run once per deploy/domain change).
 *
 *   node scripts/set-telegram-webhook.mjs
 *
 * Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET from .env (or the
 * environment) and points the bot at <app>/api/telegram/webhook with the
 * secret_token header set — the route 403s anything without it.
 *
 * Options:
 *   --url https://custom.example.com   override the webhook base URL
 */

import { readFileSync } from 'fs';

function loadEnv() {
  try {
    const env = readFileSync('.env', 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2];
      }
    }
  } catch {
    // no .env — rely on real environment variables
  }
}

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const urlArg = process.argv.find((a) => a.startsWith('--url='));
const baseUrl = urlArg ? urlArg.slice(6) : 'https://myfam.doctorboyz.com';

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set (check .env)');
  process.exit(1);
}
if (!secret) {
  console.error('TELEGRAM_WEBHOOK_SECRET is not set (check .env)');
  process.exit(1);
}

const webhookUrl = `${baseUrl}/api/telegram/webhook`;

const set = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message', 'edited_message'],
    // Vision extraction runs in after() — up to 90s. Give Telegram slack
    // to retry instead of dropping the update entirely.
    timeout: 60,
  }),
});

const setResult = await set.json();
console.log('setWebhook:', JSON.stringify(setResult, null, 2));

if (setResult.ok) {
  const info = await (await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json();
  const { url, has_custom_certificate, pending_update_count, last_error_message } = info.result;
  console.log('getWebhookInfo:', {
    url,
    has_custom_certificate,
    pending_update_count,
    ...(last_error_message ? { last_error_message } : {}),
  });
}