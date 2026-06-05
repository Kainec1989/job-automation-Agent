import { closeDatabase } from '../database/db.js';
import { VacancyRepository } from '../database/vacancyRepository.js';
import { env } from '../config/env.js';
import { EmailService } from '../sender/emailService.js';
import { syncDatabaseToSheets } from '../sheets/syncDatabaseToSheets.js';

export interface DispatchSummary {
  sent: number;
  failed: number;
}

export async function runDispatchApplications(): Promise<DispatchSummary> {
  const repository = new VacancyRepository();
  let sent = 0;
  let failed = 0;

  const pendingJobs = repository.findPendingWithEmail(env.dispatchLimit);

  if (pendingJobs.length === 0) {
    console.log('[Dispatcher] No pending vacancies with email.');
    return { sent, failed };
  }

  const emailService = new EmailService();

  console.log(`[Dispatcher] Processing ${pendingJobs.length} vacancy(ies)...`);
  await emailService.verifyConnection();

  for (const job of pendingJobs) {
    try {
      await emailService.sendApplicationEmail(job, job.email);
      repository.markContacted(job.id);
      sent += 1;
      console.log(`[Dispatcher] Sent application to ${job.company} (${job.type})`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Dispatcher] Failed job ID ${job.id}: ${message}`);
    }
  }

  console.log(`[Dispatcher] Done. Sent: ${sent}, failed: ${failed}`);

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

  return { sent, failed };
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
