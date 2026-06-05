import { env } from '../config/env.js';
import { fetchTelegramUpdates, sendTelegramMessage } from '../notifications/telegram.js';

function formatChat(chat: {
  chatId: string;
  type: string;
  title?: string;
  username?: string;
  firstName?: string;
}): string {
  const label =
    chat.title ??
    (chat.username ? `@${chat.username}` : undefined) ??
    chat.firstName ??
    'unknown';

  return `  chat_id=${chat.chatId}  (${chat.type}, ${label})`;
}

async function main(): Promise<void> {
  const token = env.telegramBotToken;

  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not set in .env');
    console.error('\nSetup:');
    console.error('  1. Open Telegram → @BotFather → /newbot');
    console.error('  2. Copy the token into .env as TELEGRAM_BOT_TOKEN=...');
    console.error('  3. Send /start to your new bot in Telegram');
    console.error('  4. Run: npm run telegram:setup');
    process.exitCode = 1;
    return;
  }

  console.log('[Telegram] Fetching recent chats (send /start to your bot if list is empty)...');

  const chats = await fetchTelegramUpdates(token);

  if (chats.length === 0) {
    console.log('\nNo messages found yet.');
    console.log('Open your bot in Telegram and send: /start');
    console.log('Then run again: npm run telegram:setup');
    return;
  }

  console.log(`\nFound ${chats.length} chat(s):\n`);
  for (const chat of chats) {
    console.log(formatChat(chat));
  }

  const configuredChatId = env.telegramChatId;

  if (!configuredChatId) {
    const preferred = chats.find((chat) => chat.type === 'private') ?? chats[0];
    console.log(`\nAdd to .env:\nTELEGRAM_CHAT_ID=${preferred!.chatId}`);
    console.log('\nThen run: npm run notify:test');
    return;
  }

  console.log(`\nConfigured TELEGRAM_CHAT_ID=${configuredChatId}`);
  console.log('[Telegram] Sending test message...');

  await sendTelegramMessage(
    '✅ Job Agent: Telegram подключён.\nПосле каждого запуска pipeline ты получишь подробную сводку на русском.',
  );

  console.log('[Telegram] Test message sent successfully.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Telegram] Setup failed: ${message}`);
  process.exitCode = 1;
});
