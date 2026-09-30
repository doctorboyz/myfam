// Register the bot's slash commands + web-app menu button via the Bot API.
// Equivalent to @BotFather /setcommands, but repeatable and scripted.
// (Command names must be a-z0-9_ — Thai only works in descriptions.)
// Usage: node scripts/set-telegram-commands.mjs
import 'dotenv/config';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://myfam.doctorboyz.com';

if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN missing from .env');
  process.exit(1);
}

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const COMMANDS = [
  { command: 'start', description: 'เริ่มใช้งาน / เชื่อมต่อบัญชี MyFam' },
  { command: 'balance', description: 'ดูยอดคงเหลือทุกบัญชี' },
  { command: 'summary', description: 'สรุปรายรับรายจ่ายเดือนนี้' },
  { command: 'help', description: 'ดูวิธีใช้งานทั้งหมด' },
  { command: 'link', description: 'เชื่อมต่อบัญชี MyFam' },
  { command: 'unlink', description: 'ยกเลิกการเชื่อมต่อกับบัญชี MyFam' },
];

const cmds = await api('setMyCommands', { commands: COMMANDS });
console.log('setMyCommands:', cmds.ok ? `ok (${COMMANDS.length} commands)` : cmds);

const menu = await api('setChatMenuButton', {
  menu_button: { type: 'web_app', text: 'เปิด MyFam', web_app: { url: WEB_APP_URL } },
});
console.log('setChatMenuButton:', menu.ok ? `ok (${WEB_APP_URL})` : menu);