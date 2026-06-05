import { closeDatabase } from '../database/db.js';
import { VacancyRepository } from '../database/vacancyRepository.js';
import { env } from '../config/env.js';
import { EmailService } from '../sender/emailService.js';

export async function runDailyApplicationPipeline(): Promise<void> {
  const repository = new VacancyRepository();
  let sent = 0;
  let failed = 0;

  try {
    const pendingJobs = repository.findPendingWithEmail(env.dispatchLimit);

    if (pendingJobs.length === 0) {
      console.log('[Dispatcher] No pending vacancies with email.');
      return;
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Dispatcher] Pipeline failed: ${message}`);
    process.exitCode = 1;
  } finally {
    closeDatabase();
    console.log('[Dispatcher] Database connection closed.');
  }
}

async function main(): Promise<void> {
  await runDailyApplicationPipeline();
}

if (process.argv[1]?.endsWith('runDailyApplicationPipeline.ts')) {
  void main();
}
