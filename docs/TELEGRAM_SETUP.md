# Telegram Setup Manual — MyFam

## 1. สร้าง Bot ผ่าน BotFather

1. เปิ Telegram แล้วค้นหา [@BotFather](https://t.me/BotFather)
2. ส่ง `/newbot`
3. กรอก display name: `MyFam` (ชื่อที่แสดงในแชท)
4. กรอก username: ต้องจบด้วย `bot` เช่น `myfam_finance_bot`
5. BotFather จะให้ **bot token** มา (รูปแบบ `<bot-id>:<random>`) — ใส่ใน `TELEGRAM_BOT_TOKEN` ใน `.env` เท่านั้น ห้าม commit เข้า repo

### 1.1 ตั้งค่า Bot Commands + ปุ่ม Web App (ทำแล้ว)

สั่งรันครั้งเดียว ไม่ต้องคุยกับ @BotFather:

```bash
node scripts/set-telegram-commands.mjs
```

script นี้เรียก Bot API สองตัว:
- `setMyCommands` — ลงทะเบียน slash commands: `/start` `/balance` `/summary` `/help` `/link` `/unlink`
  (ชื่อ command ต้องเป็น `a-z0-9_` เท่านั้น — ภาษาไทยใช้ได้แค่ description)
- `setChatMenuButton` — ปุ่ม **"เปิด MyFam"** ถัดจากช่องพิมพ์ เปิด web app
  `https://myfam.doctorboyz.com` ใน in-app browser ของ Telegram

ส่วนคำพิมพ์ภาษาไทย ("ยอด", "รายการ", "สรุป", "ปรับยอด", "ลบล่าสุด") จับผ่าน fuzzy
match ใน `src/lib/bot/commands.ts` อยู่แล้ว — ไม่ต้องลงทะเบียนเป็น command

## 2. Environment Variables

ใน `.env`:

```bash
# Telegram bot
TELEGRAM_BOT_TOKEN=<bot-id>:<random-from-botfather>
TELEGRAM_WEBHOOK_SECRET=<random hex — สร้างด้วย openssl rand -hex 32>
TELEGRAM_BOT_ENABLED=true
TELEGRAM_SLIP_ENABLED=true
```

| ตัวแปร | ความหมาย |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token จาก BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | secret ที่ Telegram จะส่งมาใน header ทุก update — ป้องกัน webhook ปลอม |
| `TELEGRAM_BOT_ENABLED` | kill switch — เป็น `false` จะ ack ทุก update แต่ไม่ประมวลผล |
| `TELEGRAM_SLIP_ENABLED` | สวิตช์แยกสำหรับอ่านสลิป (vision) — ปิดได้ถ้า vision model มีปัญหา โดย text ยังใช้ได้ปกติ |

Model สำหรับอ่านสลิปตั้งค่าที่ `AI_EXTRACT_SLIP_MODEL` (ปัจจุบัน: `ollama:gemma4:31b` — benchmark แล้วเร็วสุด ~1s/สลิป ยอดถูก 4/4)

## 3. ตั้งค่า Webhook

Deploy แล้วรัน:

```bash
docker compose build app && docker compose up -d
node scripts/set-telegram-webhook.mjs          # ใช้ TELEGRAM_WEBHOOK_URL จาก .env หรือค่าเริ่มต้น
node scripts/set-telegram-webhook.mjs --url=https://myfam.doctorboyz.com/api/telegram/webhook
```

Script จะ:
- เรียก `setWebhook` พร้อม `secret_token` (Telegram จะแนบมาใน header ทุกครั้ง)
- กำหนด `allowed_updates: ['message', 'edited_message']`
- แสดงผล `getWebhookInfo` ให้ตรวจสอบ

Production webhook URL:
```
https://myfam.doctorboyz.com/api/telegram/webhook
```

## 4. เชื่อมต่อสมาชิกในครอบครัว (link code)

1. ผู้ปกครอง login เว็บ MyFam → **Settings → สมาชิกครอบครัว**
2. กดปุ่ม **"รหัส Telegram"** ของสมาชิกที่ต้องการ — ระบบจะออกรหัส 6 ตัว (หมดอายุ 7 วัน, ใช้ครั้งเดียว)
3. สมาชิกเปิดแชทกับ bot แล้วส่ง:
   ```
   /start ABCD23
   ```
4. Bot ตอบ "เชื่อมต่อสำเร็จ" — จากนั้นส่งข้อความ/สลิปได้เลย

กฎการเชื่อมต่อ: หนึ่ง Telegram account เชื่อมกับสมาชิก MyFam ได้คนเดียว และสมาชิกหนึ่งคนเชื่อมได้ Telegram account เดียว (ยกเลิกด้วย `/unlink` ก่อนจึงเปลี่ยนเครื่องได้)

## 5. วิธีใช้ (สำหรับสมาชิก)

| พิมพ์ | ได้ |
|---|---|
| `ซื้อข้าวผัด 85 บาท` | bot ถามยืนยัน → ตอบ `ยืนยัน` = บันทึก |
| (แนบรูปสลิป) | bot อ่านยอด/วันที่/ร้าน แล้วถามยืนยัน |
| `ยอด` / `ดูยอด` | ยอดคงเหลือ + รวม — parent เห็นทุกบัญชีในครอบครัว (มีชื่อเจ้าของ), ลูกเห็นของตัวเอง |
| `รายการ` | 5 รายการล่าสุด |
| `สรุป` / `สรุปวันนี้` / `สรุปสัปดาห์นี้` | รายรับ รายจ่าย คงเหลือ + top 3 หมวด |
| `งบ` | สถานะงบประมาณ |
| `ปรับยอด 5000` | ปรับยอดบัญชีให้ตรงจริง (จะถามบัญชีถ้ามีหลายบัญชี) |
| `ลบรายการล่าสุด` | ลบ (soft delete) รายการที่ bot บันทึกล่าสุด + คืนยอด |
| `เปลี่ยนหมวด อาหาร` | แก้หมวดของรายการที่รอยืนยัน |
| `ยกเลิก` | ทิ้งรายการที่รอยืนยัน |

## 6. Architecture

```
Telegram User → Telegram Platform → /api/telegram/webhook
                                       ↓
                          verifyTelegramSecret (header, timingSafeEqual)
                                       ↓
                          200 ack ทันที → after() ประมวลผลจริง
                                       ↓
                          handleTelegramUpdate (router)
                          ↙ resolveLinkedUser          ↘ ยังไม่เชื่อมต่อ
                    private chat เท่านั้น            UNLINKED_GREETING
                    ↙ photo              ↘ text
            hashImageBuffer          detectCommand → dispatchCommand
                   ↓                    (ยอด/รายการ/สรุป/งบ/ปรับยอด/ลบล่าสุด)
            duplicate check                    ↓
                   ↓                      extractFromText (AI)
            extractFromSlip (AI)                 ↓
                   ↓                    findSimilarTransactions → session (awaiting_confirm)
            storePendingExtraction  →  "ยืนยัน" → createBotTransaction
                                                   ↓
                                    createTransaction (transaction-mutations.ts)
                                    income +amount-fee | expense -amount-fee
                                    transfer: source -amount-fee, dest +amount
```

ข้อกำหนดสำคัญ:
- **ack-then-process**: webhook ตอบ 200 เสมอเมื่อ secret ถูก งานหนัก (vision 30–90s) รันใน `after()` — Cloudflare ตัด request ที่ ~100s
- **session เก็บใน DB** (BotSession TTL 10 นาที) — restart กลางคันเมื่อไหร่ flow ไม่หลุด
- **soft-delete เท่านั้น** และ `ลบรายการล่าสุด` ลบได้เฉพาะรายการที่ bot tag `telegram-bot` บันทึก
- **ตอบไม่ได้ 3 ครั้งใน 5 นาที** → bot แนะนำใช้เว็บ app

## 7. ทดสอบก่อน deploy (sandbox route)

ไม่ต้องแตะ Telegram จริง — เรียกตรงจาก server:

```bash
curl -X POST "https://myfam.doctorboyz.com/api/telegram/sandbox?key=$TELEGRAM_SANDBOX_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"text","userId":"<myfam-user-id>","text":"ซื้อข้าวผัด 85 บาท"}'
```

ตอบกลับ `{ "handled": true, "replies": [...] }` — เห็นข้อความ bot ที่ควรส่งถึงผู้ใช้จริง

## 8. Troubleshooting

| ปัญหา | สาเหตุ | แก้ไข |
|-------|--------|------|
| Webhook set ไม่ผ่าน | token ผิด หรือ URL ไม่ใช่ HTTPS | เช็ค `TELEGRAM_BOT_TOKEN`, ใช้ tunnel/domain ที่เป็น HTTPS |
| ส่งข้อความไม่ตอบ | secret ใน .env ไม่ตรงกับที่ตั้ง webhook | รัน `node scripts/set-telegram-webhook.mjs` ใหม่ (script ใช้ secret จาก .env) |
| สลิปไม่อ่าน | `TELEGRAM_SLIP_ENABLED=false` หรือ vision model ล่ม | เช็ค env + ลองสลับ `AI_EXTRACT_SLIP_MODEL` (backup: `deepseek-v4.1-flash`) |
| `/start CODE` ไม่เชื่อม | รหัสหมดอายุ/ใช้ไปแล้ว หรือเชื่อมอีก Telegram แล้ว | ออกรหัสใหม่ใน Settings → สมาชิกครอบครัว |
| bot ตอบ "ยังไม่ได้เชื่อมต่อ" | ยังไม่ /start ด้วยรหัส | ขอรหัสจากผู้ปกครองแล้ว `/start <code>` |
| update ไม่ถูกประมวลผล | `TELEGRAM_BOT_ENABLED=false` (kill switch) | เปลี่ยนเป็น `true` แล้ว restart |