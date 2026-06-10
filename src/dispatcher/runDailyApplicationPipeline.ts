import { closeDatabase } from '../database/db.js';
import { VacancyRepository } from '../database/vacancyRepository.js';
import { env } from '../config/env.js';
import { isPlausibleHrEmail } from '../scraper/hrEmailValidation.js';
import { EmailService } from '../sender/emailService.js';
import type { PendingVacancy, VacancyType } from '../database/types.js';
import { syncDatabaseToSheets } from '../sheets/syncDatabaseToSheets.js';
import { emailDomain, isDoNotContact, requestDispatchApproval } from './dispatchGuards.js';
import { rankVacanciesByFit } from './vacancyFitScore.js';

export interface DispatchedApplication {
  company: string;
  title: string;
  email: string;
  type: VacancyType;
}

export interface DispatchFailure {
  company: string;
  title: string;
  email: string;
  error: string;
  attempt: number;
  markedFailed: boolean;
}

export interface DispatchSummary {
  sent: number;
  failed: number;
  markedFailed: number;
  skippedInvalidEmail: number;
  skippedBlocked: number;
  approvalDeclined: boolean;
  llmCoverLetters: number;
  templateCoverLetters: number;
  sentApplications: DispatchedApplication[];
  failures: DispatchFailure[];
}

export interface DispatchOptions {
  /** When false, caller is responsible for syncing Google Sheets (e.g. daily pipeline). */
  syncSheets?: boolean;
}

export async function runDispatchApplications(
  options: DispatchOptions = {},
): Promise<DispatchSummary> {
  const repository = new VacancyRepository();
  let sent = 0;
  let failed = 0;
  let markedFailed = 0;
  let skippedInvalidEmail = 0;
  let skippedBlocked = 0;
  let approvalDeclined = false;
  let llmCoverLetters = 0;
  let templateCoverLetters = 0;
  const sentApplications: DispatchedApplication[] = [];
  const failures: DispatchFailure[] = [];

  const buildSummary = (): DispatchSummary => ({
    sent,
    failed,
    markedFailed,
    skippedInvalidEmail,
    skippedBlocked,
    approvalDeclined,
    llmCoverLetters,
    templateCoverLetters,
    sentApplications,
    failures,
  });

  const candidates = rankVacanciesByFit(
    repository.findPendingWithEmail(env.dispatchLimit, env.dispatchMaxRetries),
  );

  if (candidates.length > 0) {
    const top = candidates[0]!;
    console.log(
      `[Dispatcher] Fit-ranked queue: top score ${top.fitScore} — ${top.company} (${top.title})`,
    );
  }

  // Filter out blocked recipients (DO_NOT_CONTACT) before asking for approval or sending.
  const pendingJobs: PendingVacancy[] = [];
  for (const job of candidates) {
    if (isDoNotContact(job.company, job.email)) {
      console.warn(
        `[Dispatcher] Blocked by DO_NOT_CONTACT: ${job.company} <${job.email}> (id=${job.id})`,
      );
      repository.recordDispatchEvent({
        vacancyId: job.id,
        company: job.company,
        email: job.email,
        outcome: 'skipped_duplicate',
        error: 'do_not_contact',
      });
      skippedBlocked += 1;
      continue;
    }
    pendingJobs.push(job);
  }

  if (pendingJobs.length === 0) {
    console.log('[Dispatcher] No pending vacancies with email.');
    return buildSummary();
  }

  if (env.dispatchRequireApproval) {
    const approved = await requestDispatchApproval(pendingJobs);
    if (!approved) {
      approvalDeclined = true;
      console.log('[Dispatcher] Dispatch not approved — nothing sent.');
      return buildSummary();
    }
  }

  const emailService = new EmailService();

  console.log(`[Dispatcher] Processing ${pendingJobs.length} vacancy(ies)...`);
  await emailService.verifyConnection();

  const sentEmails = new Set<string>();
  const sentCompanies = new Set<string>();

  for (const job of pendingJobs) {
    const emailKey = job.email.trim().toLowerCase();
    const companyKey = job.company.trim().toLowerCase();

    const domain = emailDomain(emailKey);
    if (
      env.dispatchMaxPerDomainPerDay > 0 &&
      domain &&
      repository.countSentToDomainToday(domain) >= env.dispatchMaxPerDomainPerDay
    ) {
      console.log(
        `[Dispatcher] Per-domain daily limit reached for ${domain} — skipping ${job.company} (id=${job.id})`,
      );
      repository.recordDispatchEvent({
        vacancyId: job.id,
        company: job.company,
        email: job.email,
        outcome: 'skipped_duplicate',
        error: 'domain_daily_limit',
      });
      skippedBlocked += 1;
      continue;
    }

    if (sentEmails.has(emailKey) || sentCompanies.has(companyKey)) {
      console.log(
        `[Dispatcher] Skipping duplicate in this run: ${job.company} <${job.email}> (id=${job.id})`,
      );
      repository.recordDispatchEvent({
        vacancyId: job.id,
        company: job.company,
        email: job.email,
        outcome: 'skipped_duplicate',
      });
      continue;
    }

    if (!isPlausibleHrEmail(job.email, job.company)) {
      console.warn(
        `[Dispatcher] Skipping invalid email ${job.email} for ${job.company} (id=${job.id})`,
      );
      repository.clearEmail(job.id);
      repository.recordDispatchEvent({
        vacancyId: job.id,
        company: job.company,
        email: job.email,
        outcome: 'skipped_invalid_email',
      });
      skippedInvalidEmail += 1;
      continue;
    }

    try {
      const coverLetterSource = await emailService.sendApplicationEmail(job, job.email);
      if (coverLetterSource === 'llm') {
        llmCoverLetters += 1;
      } else {
        templateCoverLetters += 1;
      }
      repository.markContacted(job.id);
      repository.recordDispatchEvent({
        vacancyId: job.id,
        company: job.company,
        email: job.email,
        outcome: 'sent',
      });
      sentEmails.add(emailKey);
      sentCompanies.add(companyKey);
      sent += 1;
      sentApplications.push({
        company: job.company,
        title: job.title,
        email: job.email,
        type: job.type,
      });
      console.log(`[Dispatcher] Sent application to ${job.company} (${job.type})`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Dispatcher] Failed job ID ${job.id}: ${message}`);
      repository.recordDispatchEvent({
        vacancyId: job.id,
        company: job.company,
        email: job.email,
        outcome: 'failed',
        error: message,
      });

      let outcome: 'retry' | 'failed' = 'retry';
      try {
        outcome = repository.recordDispatchFailure(job.id, message, env.dispatchMaxRetries);
        if (outcome === 'failed') {
          markedFailed += 1;
          console.warn(
            `[Dispatcher] Marked as failed after ${env.dispatchMaxRetries} attempts: ${job.company} (id=${job.id})`,
          );
        } else {
          console.warn(
            `[Dispatcher] Will retry later (attempt ${job.dispatchRetryCount + 1}/${env.dispatchMaxRetries}): ${job.company}`,
          );
        }
      } catch (recordError) {
        const recordMessage =
          recordError instanceof Error ? recordError.message : String(recordError);
        console.error(`[Dispatcher] Could not record failure for id=${job.id}: ${recordMessage}`);
      }

      failures.push({
        company: job.company,
        title: job.title,
        email: job.email,
        error: message,
        attempt: job.dispatchRetryCount + 1,
        markedFailed: outcome === 'failed',
      });
    }
  }

  console.log(
    `[Dispatcher] Done. Sent: ${sent}, failed: ${failed}, marked failed: ${markedFailed}, ` +
      `invalid email skipped: ${skippedInvalidEmail}, blocked/limited: ${skippedBlocked}`,
  );

  if (options.syncSheets !== false && sent > 0 && env.googleSpreadsheetId) {
    try {
      console.log('[Dispatcher] Syncing updated statuses to Google Sheets...');
      await syncDatabaseToSheets();
      console.log('[Dispatcher] Google Sheets updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Dispatcher] Google Sheets sync failed: ${message}`);
    }
  }

  return buildSummary();
}

/** @deprecated Use runDispatchApplications */
export async function runDailyApplicationPipeline(): Promise<void> {
  await runDispatchApplications();
}

async function main(): Promise<void> {
  try {
    const summary = await runDispatchApplications();
    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Dispatcher] Pipeline failed: ${message}`);
    process.exitCode = 1;
  } finally {
    closeDatabase();
    console.log('[Dispatcher] Database connection closed.');
  }
}

if (process.argv[1]?.endsWith('runDailyApplicationPipeline.ts')) {
  void main();
}
