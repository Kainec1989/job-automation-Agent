import { env } from '../config/env.js';
import { isTelegramConfigured, sendTelegramMessage, waitForTelegramReply } from '../notifications/telegram.js';
import type { PendingVacancy } from '../database/types.js';

const APPROVE_WORDS = new Set(['yes', 'y', 'ok', 'ok!', 'go', 'send', 'approve', 'да', '+', '👍']);
const DECLINE_WORDS = new Set(['no', 'n', 'stop', 'cancel', 'skip', 'нет', '-', '👎']);

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

/**
 * Returns true when a company or email is on the DO_NOT_CONTACT list.
 * Entries match against the email address, the email domain, or a substring of the company name.
 */
export function isDoNotContact(company: string, email: string): boolean {
  if (env.doNotContact.length === 0) {
    return false;
  }

  const companyLower = company.trim().toLowerCase();
  const emailLower = email.trim().toLowerCase();
  const domain = emailDomain(emailLower);

  return env.doNotContact.some((entry) => {
    if (!entry) {
      return false;
    }
    if (emailLower && emailLower === entry) {
      return true;
    }
    if (domain && domain === entry) {
      return true;
    }
    return companyLower.length > 0 && companyLower.includes(entry);
  });
}

export function formatApprovalMessage(jobs: PendingVacancy[]): string {
  const lines = jobs.map(
    (job, index) => `${index + 1}. ${job.company} — ${job.title}\n   ${job.email}`,
  );

  return [
    `Готов отправить ${jobs.length} заявку(и):`,
    '',
    ...lines,
    '',
    'Ответьте "да" чтобы отправить или "нет" чтобы отменить.',
  ].join('\n');
}

/**
 * Asks for human approval via Telegram before sending. Returns true if approved.
 * If Telegram is not configured, approval cannot be obtained and dispatch is declined.
 */
export async function requestDispatchApproval(jobs: PendingVacancy[]): Promise<boolean> {
  if (jobs.length === 0) {
    return true;
  }

  if (!isTelegramConfigured()) {
    console.warn(
      '[Dispatcher] DISPATCH_REQUIRE_APPROVAL is on but Telegram is not configured — declining dispatch.',
    );
    return false;
  }

  await sendTelegramMessage(formatApprovalMessage(jobs));
  console.log('[Dispatcher] Approval requested via Telegram, waiting for reply...');

  const reply = await waitForTelegramReply({ timeoutMs: env.dispatchApprovalTimeoutMs });

  if (reply === null) {
    console.warn('[Dispatcher] Approval timed out — declining dispatch.');
    await safeNotify('Время ожидания истекло — отправка отменена.');
    return false;
  }

  const normalized = reply.toLowerCase();
  if (APPROVE_WORDS.has(normalized)) {
    await safeNotify('Подтверждено — отправляю заявки.');
    return true;
  }

  if (DECLINE_WORDS.has(normalized)) {
    await safeNotify('Отменено — заявки не отправлены.');
    return false;
  }

  console.warn(`[Dispatcher] Unrecognized approval reply "${reply}" — declining dispatch.`);
  await safeNotify('Ответ не распознан — отправка отменена. Используйте "да"/"нет".');
  return false;
}

async function safeNotify(text: string): Promise<void> {
  try {
    await sendTelegramMessage(text);
  } catch {
    // best-effort confirmation only
  }
}
