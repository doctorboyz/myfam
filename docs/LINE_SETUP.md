# LINE Setup Manual — MyFam

## 1. LINE Developers Console

ไปที่ [LINE Developers Console](https://developers.line.biz/console/)

### 1.1 สร้าง Provider

1. เข้าสู่ระบบด้วย LINE account
2. คลิก **Create a new provider**
3. กรอก Provider name: `MyFam` (หรือชื่อที่ต้องการ)
4. คลิก **Create**

### 1.2 สร้าง Messaging API Channel

1. ใน Provider ที่สร้าง คลิก **Create a Messaging API channel**
2. กรอกข้อมูล:
   - **Channel icon**: อัปโหลดไอคอนแอพ
   - **Channel name**: `MyFam` (ชื่อที่แสดงใน LINE)
   - **Channel description**: `ผู้ช่วยจดการเงินครอบครัว`
   - **Category**: `Finance`
   - **Subcategory**: `Personal finance`
   - **Email address**: อีเมลสำหรับติดต่อ
3. คลิก **Create**

### 1.3 ดึง Channel Credentials

ไปที่ **Messaging API** tab:

- **Channel secret** → ใส่ใน `LINE_CHANNEL_SECRET` ใน `.env`
- **Channel access token** → คลิก Issue → ใส่ใน `LINE_CHANNEL_ACCESS_TOKEN` ใน `.env`

### 1.4 ตั้งค่า Webhook URL

ไปที่ **Messaging API** tab:

1. หาส่วน **Webhook settings**
2. กรอก **Webhook URL**:
   ```
   https://your-domain.com/api/line/webhook
   ```
   - สำหรับ dev (localhost): ใช้ ngrok หรือ cloudflare tunnel
   - สำหรับ production: ใช้ domain จริง

3. คลิก **Verify** เพื่อทดสอบ connection
4. เปิด **Use webhook** → On
5. เปิด **Auto-reply messages** → Off (เพื่อให้ bot เราจัดการเอง)

### 1.5 ตั้งค่า Bot Behavior

ใน **Messaging API** tab:

- **Greeting message**: ปิด (เราจัดการเองใน webhook)
- **Auto-reply messages**: ปิด
- **Allow bot to join group chats**: เปิด (ถ้าต้องการใช้ใน group)
- **LINE Official Account features**: เปิดตามที่ต้องการ

## 2. LIFF (LINE Front-end Framework)

### 2.1 สร้าง LIFF App

1. ใน Provider เดียวกัน คลิก **Create a new channel**
2. เลือก **LINE Login channel**
3. กรอกข้อมูล:
   - **Channel name**: `MyFam Login`
   - อื่นๆ ตามที่ต้องการ
4. คลิก **Create**

### 2.2 เพิ่ม LIFF App

1. ไปที่ **LIFF** tab ใน LINE Login channel
2. คลิก **Add**
3. กรอก:
   - **LIFF app name**: `MyFam`
   - **Size**: `Compact` (หรือ `Full` ตามต้องการ)
   - **URL**: `https://your-domain.com/liff` (URL ของ LIFF page)
4. คลิก **Create**
5. คัดลอก **LIFF ID** (ขึ้นต้นด้วย `liff-...`) → ใส่ใน `NEXT_PUBLIC_LIFF_ID` ใน `.env`

### 2.3 ตั้งค่า LINE Login

ใน LINE Login channel:

1. ไปที่ **LINE Login** tab
2. เพิ่ม **Callback URL**:
   ```
   https://your-domain.com/api/line/link
   https://your-domain.com/liff
   ```
3. เปิด **OpenID Connect** ถ้าต้องการดู email/profile

## 3. Environment Variables

ใน `.env` (หรือ `.env.local`):
9hv
```bash
# LINE Messaging API
LINE_CHANNEL_SECRET=your_channel_secret_here
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token_here

# LIFF
NEXT_PUBLIC_LIFF_ID=liff-xxxxxxxxxx

# Ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=kimi-k2.6:cloud

# Database (ถ้ายังไม่มี)
DATABASE_URL=postgresql://myfam:88888888@myfam-db:5432/myfam
```

## 4. Webhook URL สำหรับ Dev/Production

### Development (localhost)

ใช้ ngrok หรือ Cloudflare Tunnel:

```bash
# ตัวเลือก 1: ngrok
ngrok http 3000

# ตัวเลือก 2: cloudflare tunnel
cloudflared tunnel --url http://localhost:3000
```

นำ HTTPS URL ที่ได้ไปใส่ใน LINE Developers Console:
```
https://xxxx.ngrok-free.app/api/line/webhook
```

### Production

```
https://your-domain.com/api/line/webhook
```

## 5. ทดสอบ Webhook

1. ตั้งค่า Webhook URL ใน LINE Developers Console
2. คลิก **Verify** — ควรได้ `200 OK`
3. เพิ่ม Bot เป็นเพื่อนใน LINE (สแกน QR code จาก Console)
4. ส่งข้อความ "ช่วยเหลือ" ไปที่ Bot
5. ควรได้ reply กลับมา

## 6. Architecture

```
LINE User → LINE Platform → Webhook URL (/api/line/webhook)
                                  ↓
                            verifyLineSignature()
                                  ↓
                            handleEvent()
                           ↙       ↘
                   Text Message    Image Message
                        ↓               ↓
               handleTextCommand   handleImageMessage
              ↙    ↓     ↘              ↓
          ยอด/สรุป  ช่วยเหลือ  Text Parse   processSlipImage()
                        ↓                         ↓
                  parseTextCommand()        Ollama kimi-k2.6:cloud
                        ↓                         ↓
                  Category Vault → Match     Category Vault → Match
                        ↓                         ↓
                  Confirmation Quick Reply    Confirmation Quick Reply
                        ↓                         ↓
                  handlePostback() → createTransactionFromLine()
                        ↓
                  recordCategoryChoice() → Learning Vault
```

## 7. Troubleshooting

| ปัญหา | สาเหตุ | แก้ไข |
|-------|--------|------|
| Webhook Verify ไม่ผ่าน | URL ผิดหรือ server ไม่ทำงาน | เช็ค URL, restart server |
| ส่งข้อความไม่ตอบ | Channel secret/token ผิด | เช็ค `.env` values |
| สลิปไม่อ่าน | Ollama ไม่ทำงาน | เช็ค `OLLAMA_BASE_URL` และ `OLLAMA_MODEL` |
| LIFF เปิดไม่ได้ | LIFF ID ผิด | เช็ค `NEXT_PUBLIC_LIFF_ID` |
| ผูกบัญชีไม่ได้ | LINE Login callback ผิด | เช็ค callback URL ใน Console |