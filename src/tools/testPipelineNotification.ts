import { formatPipelineSummary } from '../notifications/pipelineNotification.js';
import { isTelegramConfigured, sendTelegramMessage } from '../notifications/telegram.js';
import { env } from '../config/env.js';

const mockSummary = {
  scraped: 5,
  sheetsImport: { rowsRead: 10, emailsUpdated: 1, statusesUpdated: 0, skipped: 9, errors: 0 },
  reclassify: {
    processed: 170,
    archived: 2,
    typeUpdated: 0,
    fieldsCleaned: 0,
    emailsCleared: 0,
    unchanged: 128,
    skipped: 40,
  },
  sheetsSynced: true,
  tavily: {
    processed: 5,
    saved: 2,
    notFound: 3,
    failed: 0,
    skipped: 0,
    cacheHits: 1,
    savedEmails: [
      {
        company: 'SachsenEnergie AG',
        title: 'Junior Frontend Developer (m/w/d)',
        email: 'karriere@sachsenenergie.de',
      },
      {
        company: 'Muster GmbH',
        title: 'Testautomatisierer Junior',
        email: 'bewerbung@muster.de',
      },
    ],
  },
  dispatch: {
    sent: 2,
    failed: 0,
    markedFailed: 0,
    skippedInvalidEmail: 0,
    sentApplications: [
      {
        company: 'SachsenEnergie AG',
        title: 'Junior Frontend Developer (m/w/d)',
        email: 'karriere@sachsenenergie.de',
        type: 'junior' as const,
      },
      {
        company: 'Example GmbH',
        title: 'Praktikum Softwareentwicklung',
        email: 'bewerbung@example.de',
        type: 'praktikum' as const,
      },
    ],
    failures: [],
    skippedBlocked: 0,
    approvalDeclined: false,
  },
};

async function main(): Promise<void> {
  if (!isTelegramConfigured()) {
    if (env.telegramBotToken && !env.telegramChatId) {
      console.error('TELEGRAM_CHAT_ID is missing. Run: npm run telegram:setup');
    } else {
      console.error('TELEGRAM_BOT_TOKEN is missing. Create a bot via @BotFather first.');
    }
    process.exitCode = 1;
    return;
  }

  console.log('[Notify] Sending test summary to Telegram...');
  await sendTelegramMessage(formatPipelineSummary(mockSummary));
  console.log('[Notify] Done.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Notify] Test failed: ${message}`);
  process.exitCode = 1;
});
