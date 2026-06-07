import { closeDatabase } from '../database/db.js';
import { VacancyRepository } from '../database/vacancyRepository.js';
import { env } from '../config/env.js';
import { isPlausibleHrEmail } from '../scraper/hrEmailValidation.js';
import { EmailService } from '../sender/emailService.js';
import type { VacancyType } from '../database/types.js';
import { syncDatabaseToSheets } from '../sheets/syncDatabaseToSheets.js';

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
  sentApplications: DispatchedApplication[];
  failures: DispatchFailure[];
}

export async function runDispatchApplications(): Promise<DispatchSummary> {
  const repository = new VacancyRepository();
  let sent = 0;
  let failed = 0;
  let markedFailed = 0;
  let skippedInvalidEmail = 0;
  const sentApplications: DispatchedApplication[] = [];
  const failures: DispatchFailure[] = [];

  const pendingJobs = repository.findPendingWithEmail(env.dispatchLimit, env.dispatchMaxRetries);

  if (pendingJobs.length === 0) {
    console.log('[Dispatcher] No pending vacancies with email.');
    return {
      sent,
      failed,
      markedFailed,
      skippedInvalidEmail,
      sentApplications,
      failures,
    };
  }

  const emailService = new EmailService();

  console.log(`[Dispatcher] Processing ${pendingJobs.length} vacancy(ies)...`);
  await emailService.verifyConnection();

  const sentEmails = new Set<string>();
  const sentCompanies = new Set<string>();

  for (const job of pendingJobs) {
    const emailKey = job.email.trim().toLowerCase();
    const companyKey = job.company.trim().toLowerCase();

    if (sentEmails.has(emailKey) || sentCompanies.has(companyKey)) {
      console.log(
        `[Dispatcher] Skipping duplicate in this run: ${job.company} <${job.email}> (id=${job.id})`,
      );
      continue;
    }

    if (!isPlausibleHrEmail(job.email, job.company)) {
      console.warn(
        `[Dispatcher] Skipping invalid email ${job.email} for ${job.company} (id=${job.id})`,
      );
      repository.clearEmail(job.id);
      skippedInvalidEmail += 1;
      continue;
    }

    try {
      await emailService.sendApplicationEmail(job, job.email);
      repository.markContacted(job.id);
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
    `[Dispatcher] Done. Sent: ${sent}, failed: ${failed}, marked failed: ${markedFailed}, invalid email skipped: ${skippedInvalidEmail}`,
  );

  if (sent > 0 && env.googleSpreadsheetId) {
    try {
      console.log('[Dispatcher] Syncing updated statuses to Google Sheets...');
      await syncDatabaseToSheets();
      console.log('[Dispatcher] Google Sheets updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Dispatcher] Google Sheets sync failed: ${message}`);
    }
  }

  return {
    sent,
    failed,
    markedFailed,
    skippedInvalidEmail,
    sentApplications,
    failures,
  };
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
