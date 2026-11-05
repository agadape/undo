// telegram_setup — connect the Coba Curi guard to a Telegram bot. Reads TELEGRAM_BOT_TOKEN from the root .env
// (never printed), finds the chat that messaged the bot, saves TELEGRAM_CHAT_ID to .env, sends a test message.
//   1. Telegram: @BotFather → /newbot → put the token in .env as TELEGRAM_BOT_TOKEN=...
//   2. Send any message to the new bot (or add it to a group and send a message there).
//   3. node telegram_setup.mjs            (finds the chat, saves TELEGRAM_CHAT_ID)
//      node telegram_setup.mjs --test     (also sends a test message)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./lib.mjs"; // loads the root .env

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token || !/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
  console.log("TELEGRAM_BOT_TOKEN is missing or malformed in .env (format 123456:ABC…)");
  process.exit(1);
}
const api = async (method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description ?? r.status}`);
  return j.result;
};

const me = await api("getMe");
console.log(`bot: @${me.username} (${me.first_name})`);
let chatId = process.env.TELEGRAM_CHAT_ID;
if (!chatId) {
  const updates = await api("getUpdates", { timeout: 0, allowed_updates: ["message", "my_chat_member"] });
  const chats = new Map();
  for (const u of updates) {
    const c = u.message?.chat ?? u.my_chat_member?.chat;
    if (c) chats.set(String(c.id), c.title ?? c.username ?? c.first_name ?? c.type);
  }
  if (chats.size === 0) {
    console.log("no chat yet: send any message to the bot (or in a group with the bot), then run this again");
    process.exit(2);
  }
  if (chats.size > 1) {
    console.log("several chats wrote to the bot; set TELEGRAM_CHAT_ID in .env to one of:");
    for (const [id, name] of chats) console.log(`  ${id}  ${name}`);
    process.exit(3);
  }
  [[chatId]] = [...chats];
  fs.appendFileSync(envPath, `TELEGRAM_CHAT_ID=${chatId}\n`);
  console.log(`saved TELEGRAM_CHAT_ID=${chatId} (${[...chats.values()][0]}) to .env`);
} else {
  console.log(`TELEGRAM_CHAT_ID already set: ${chatId}`);
}
if (process.argv.includes("--test")) {
  await api("sendMessage", { chat_id: chatId, text: "✅ Penjaga Coba Curi (Undo) terhubung ke Telegram. Pesan berikutnya: Panik, finalisasi, isi ulang umpan, dan gangguan penjaga." });
  console.log("test message sent");
}
