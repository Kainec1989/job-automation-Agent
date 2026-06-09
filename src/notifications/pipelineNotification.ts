import { env, getSmtpConfig } from '../config/env.js';
import type { DailyPipelineSummary } from '../pipeline/pipelineTypes.js';
import { EmailService } from '../sender/emailService.js';
import { isTelegramConfigured, sendTelegramMessage } from './telegram.js';

export interface PipelineNotificationResult {
  emailSent: boolean;
  telegramSent: boolean;
}

const LIST_LIMIT = 15;

function formatRuDate(): string {
  return new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function appendLimitedList(lines: string[], header: string, items: string[]): void {
  if (items.length === 0) {
    return;
  }

  lines.push(header);
  const shown = items.slice(0, LIST_LIMIT);
  lines.push(...shown.map((line) => `  ${line}`));

  if (items.length > LIST_LIMIT) {
    lines.push(`  … и ещё ${items.length - LIST_LIMIT}`);
  }
}

function vacancyTypeLabel(type: string): string {
  return type === 'praktikum' ? 'практика' : 'junior';
}

export function formatPipelineSummary(summary: DailyPipelineSummary): string {
  const lines: string[] = [];

  lines.push(`📋 Job Agent — ${formatRuDate()}`);
  lines.push('');

  if (summary.sheetsImport) {
    const { emailsUpdated, statusesUpdated, errors } = summary.sheetsImport;
    if (emailsUpdated > 0 || statusesUpdated > 0 || errors > 0) {
      lines.push('📥 Google Sheets (импорт)');
      if (emailsUpdated > 0) {
        lines.push(`  Обновлено email: ${emailsUpdated}`);
      }
      if (statusesUpdated > 0) {
        lines.push(`  Обновлено статусов: ${statusesUpdated}`);
      }
      if (errors > 0) {
        lines.push(`  Ошибок: ${errors}`);
      }
      lines.push('');
    }
  }

  if (summary.scraped !== null) {
    lines.push('🔍 Скрапинг');
    lines.push(`  Новых вакансий: ${summary.scraped.total}`);
    if (summary.scraped.bySource.length > 0) {
      for (const source of summary.scraped.bySource) {
        lines.push(`  ${source.source}: принято ${source.accepted}, отклонено ${source.rejected}`);
      }
    }
    lines.push('');
  }

  if (summary.reclassify) {
    const { archived, emailsCleared, unchanged, typeUpdated } = summary.reclassify;
    if (archived > 0 || emailsCleared > 0 || typeUpdated > 0) {
      lines.push('🗂 Реклассификация');
      if (archived > 0) {
        lines.push(`  В архив: ${archived}`);
      }
      if (emailsCleared > 0) {
        lines.push(`  Удалено плохих email: ${emailsCleared}`);
      }
      if (typeUpdated > 0) {
        lines.push(`  Смена типа: ${typeUpdated}`);
      }
      lines.push(`  Активных (new): ${unchanged + typeUpdated}`);
      lines.push('');
    }
  }

  if (summary.sheetsSynced) {
    lines.push('📤 Google Sheets');
    lines.push('  Экспорт в таблицу: да');
    lines.push('');
  }

  if (summary.tavily) {
    const { saved, notFound, failed, cacheHits, processed, savedEmails } = summary.tavily;
    if (saved > 0 || notFound > 0 || failed > 0) {
      lines.push('🔎 Tavily (поиск email)');
      lines.push(`  Сохранено в БД: ${saved}`);
      if (processed > 0) {
        const hitRate = Math.round((cacheHits / processed) * 100);
        lines.push(`  Cache hit rate: ${hitRate}% (${cacheHits}/${processed})`);
      }
      if (cacheHits > 0) {
        lines.push(`  Из кэша: ${cacheHits}`);
      }
      if (notFound > 0) {
        lines.push(`  Не найдено: ${notFound}`);
      }
      if (failed > 0) {
        lines.push(`  Ошибок API: ${failed}`);
      }

      appendLimitedList(
        lines,
        '',
        savedEmails.map(
          (item) => `• ${item.company}\n    ${truncate(item.title)} → ${item.email}`,
        ),
      );
      lines.push('');
    }
  }

  if (summary.dispatch) {
    const {
      sent,
      failed,
      markedFailed,
      skippedInvalidEmail,
      sentApplications,
      failures,
    } = summary.dispatch;

    if (
      sent > 0 ||
      failed > 0 ||
      markedFailed > 0 ||
      skippedInvalidEmail > 0 ||
      sentApplications.length > 0
    ) {
      lines.push('✉️ Отправка заявок');

      const { llmCoverLetters, templateCoverLetters } = summary.dispatch;

      if (sent > 0) {
        lines.push(`  Отправлено: ${sent}`);
        if (llmCoverLetters > 0 || templateCoverLetters > 0) {
          lines.push(
            `  Anschreiben: LLM ${llmCoverLetters}, шаблон ${templateCoverLetters}`,
          );
        }
        appendLimitedList(
          lines,
          '',
          sentApplications.map(
            (app) =>
              `• ${app.company} (${vacancyTypeLabel(app.type)})\n` +
              `    ${truncate(app.title)}\n` +
              `    → ${app.email}`,
          ),
        );
      } else {
        lines.push('  Отправлено: 0');
      }

      if (skippedInvalidEmail > 0) {
        lines.push(`  Пропущено (плохой email): ${skippedInvalidEmail}`);
      }

      if (failures.length > 0) {
        lines.push(`  Ошибок отправки: ${failed}`);
        appendLimitedList(
          lines,
          '',
          failures.map((item) => {
            const status = item.markedFailed
              ? 'статус failed'
              : `повтор завтра (${item.attempt}/${env.dispatchMaxRetries})`;
            return (
              `• ${item.company}\n` +
              `    ${truncate(item.title)} → ${item.email}\n` +
              `    ${status}: ${truncate(item.error, 80)}`
            );
          }),
        );
      }

      if (markedFailed > 0) {
        lines.push(`  Помечено failed: ${markedFailed}`);
      }

      lines.push('');
    }
  }

  if (summary.healthWarnings.length > 0) {
    lines.push('🩺 Проверки');
    lines.push(...summary.healthWarnings.map((warning) => `  ⚠️ ${warning}`));
    lines.push('');
  }

  const hasErrors =
    (summary.dispatch?.failed ?? 0) > 0 ||
    (summary.dispatch?.markedFailed ?? 0) > 0 ||
    (summary.tavily?.failed ?? 0) > 0 ||
    (summary.sheetsImport?.errors ?? 0) > 0 ||
    summary.healthWarnings.length > 0;

  lines.push(hasErrors ? '⚠️ Завершено с ошибками' : '✅ Завершено успешно');

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

async function sendEmailNotification(text: string): Promise<boolean> {
  if (!env.pipelineNotifyEmail) {
    return false;
  }

  try {
    const smtp = getSmtpConfig();
    const to = env.notifyEmailTo || smtp.user;
    const emailService = new EmailService();

    await emailService.sendEmail({
      to,
      subject: 'Сводка Job Agent',
      text,
    });

    console.log(`[Notify] Email summary sent to ${to}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Notify] Email notification failed: ${message}`);
    return false;
  }
}

async function sendTelegramNotification(text: string): Promise<boolean> {
  if (!isTelegramConfigured()) {
    return false;
  }

  try {
    await sendTelegramMessage(text);
    console.log('[Notify] Telegram summary sent.');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Notify] Telegram notification failed: ${message}`);
    return false;
  }
}

export function isPipelineNotificationConfigured(): boolean {
  if (!env.pipelineNotifyEnabled) {
    return false;
  }

  const hasEmail = env.pipelineNotifyEmail;
  const hasTelegram = isTelegramConfigured();
  return hasEmail || hasTelegram;
}

export async function sendPipelineNotification(
  summary: DailyPipelineSummary,
): Promise<PipelineNotificationResult> {
  if (!isPipelineNotificationConfigured()) {
    return { emailSent: false, telegramSent: false };
  }

  const text = formatPipelineSummary(summary);

  const [emailSent, telegramSent] = await Promise.all([
    sendEmailNotification(text),
    sendTelegramNotification(text),
  ]);

  return { emailSent, telegramSent };
}
