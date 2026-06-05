import { closeDatabase } from '../database/db.js';
import { env, getTavilyConfig, isTavilyConfigured } from '../config/env.js';
import { runDispatchApplications } from '../dispatcher/runDailyApplicationPipeline.js';
import { enrichVacanciesWithTavily } from '../enrichment/tavily/enrichDatabase.js';
import { reclassifyVacancies } from '../tools/reclassifyVacancies.js';
import { scrapeAndPersist } from '../scraper/runAllScrapers.js';
import { sendPipelineNotification } from '../notifications/pipelineNotification.js';
import { syncDatabaseToSheets } from '../sheets/syncDatabaseToSheets.js';
import { syncSheetsToDatabase } from '../sheets/syncSheetsToDatabase.js';
import type { SheetsImportSummary } from '../sheets/syncSheetsToDatabase.js';
import type { DailyPipelineOptions, DailyPipelineSummary } from './pipelineTypes.js';

export type { DailyPipelineOptions, DailyPipelineSummary } from './pipelineTypes.js';

function parseArgs(argv: string[]): DailyPipelineOptions {
  const options: DailyPipelineOptions = {};

  for (const arg of argv) {
    if (arg === '--skip-scrape') options.skipScrape = true;
    if (arg === '--skip-reclassify') options.skipReclassify = true;
    if (arg === '--skip-sheets') options.skipSheets = true;
    if (arg === '--skip-sheets-import') options.skipSheetsImport = true;
    if (arg === '--skip-tavily') options.skipTavily = true;
    if (arg === '--skip-dispatch') options.skipDispatch = true;
    if (arg === '--skip-notify') options.skipNotify = true;
  }

  return options;
}

async function importSheetsStep(): Promise<SheetsImportSummary | null> {
  if (!env.googleSpreadsheetId) {
    console.log('[Pipeline] Skipping Sheets import: GOOGLE_SPREADSHEET_ID not set.');
    return null;
  }

  try {
    const summary = await syncSheetsToDatabase();
    console.log(
      `[Pipeline] Sheets import: ${summary.emailsUpdated} emails, ` +
        `${summary.statusesUpdated} statuses updated.`,
    );
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Pipeline] Sheets import failed: ${message}`);
    return {
      rowsRead: 0,
      emailsUpdated: 0,
      statusesUpdated: 0,
      skipped: 0,
      errors: 1,
    };
  }
}

async function syncSheetsStep(label: string): Promise<boolean> {
  if (!env.googleSpreadsheetId) {
    console.log(`[Pipeline] Skipping Sheets sync (${label}): GOOGLE_SPREADSHEET_ID not set.`);
    return false;
  }

  try {
    await syncDatabaseToSheets();
    console.log(`[Pipeline] Google Sheets synced (${label}).`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Pipeline] Sheets sync failed (${label}): ${message}`);
    return false;
  }
}

function shouldRunTavily(skipTavily?: boolean): boolean {
  if (skipTavily) {
    return false;
  }

  if (!isTavilyConfigured()) {
    return false;
  }

  try {
    return getTavilyConfig().enabled;
  } catch {
    return false;
  }
}

export async function runDailyPipeline(
  options: DailyPipelineOptions = {},
): Promise<DailyPipelineSummary> {
  const summary: DailyPipelineSummary = {
    scraped: null,
    sheetsImport: null,
    reclassify: null,
    sheetsSynced: false,
    tavily: null,
    dispatch: null,
  };

  console.log('\n========== Daily pipeline started ==========\n');

  if (!options.skipSheetsImport) {
    console.log('--- Step 1/6: Sheets import ---');
    summary.sheetsImport = await importSheetsStep();
    console.log();
  } else {
    console.log('--- Step 1/6: Sheets import (skipped) ---\n');
  }

  if (!options.skipScrape) {
    console.log('--- Step 2/6: Scrape ---');
    summary.scraped = await scrapeAndPersist();
    console.log(`[Pipeline] Scraped ${summary.scraped} vacancy/vacancies.\n`);
  } else {
    console.log('--- Step 2/6: Scrape (skipped) ---\n');
  }

  if (!options.skipReclassify) {
    console.log('--- Step 3/6: Reclassify ---');
    summary.reclassify = reclassifyVacancies();
    console.log(
      `[Pipeline] Reclassify: archived ${summary.reclassify.archived}, ` +
        `type updated ${summary.reclassify.typeUpdated}, ` +
        `fields cleaned ${summary.reclassify.fieldsCleaned}.\n`,
    );
  } else {
    console.log('--- Step 3/6: Reclassify (skipped) ---\n');
  }

  if (!options.skipSheets) {
    console.log('--- Step 4/6: Sheets sync ---');
    summary.sheetsSynced = await syncSheetsStep('after reclassify');
    console.log();
  } else {
    console.log('--- Step 4/6: Sheets sync (skipped) ---\n');
  }

  if (shouldRunTavily(options.skipTavily)) {
    console.log('--- Step 5/6: Tavily email enrichment ---');
    const tavilyConfig = getTavilyConfig();
    summary.tavily = await enrichVacanciesWithTavily({
      limit: tavilyConfig.maxLookups,
      syncSheets: false,
      onResult: (label, result, saved) => {
        const status = result.email
          ? saved
            ? `saved ${result.email}`
            : `found ${result.email}`
          : 'not found';
        console.log(`[Tavily] ${label} → ${status}`);
      },
    });
    console.log(
      `[Pipeline] Tavily: processed ${summary.tavily.processed}, ` +
        `saved ${summary.tavily.saved}, not found ${summary.tavily.notFound}` +
        `${summary.tavily.cacheHits > 0 ? `, cache hits ${summary.tavily.cacheHits}` : ''}.\n`,
    );

    if (!options.skipSheets && summary.tavily.saved > 0) {
      summary.sheetsSynced = (await syncSheetsStep('after tavily')) || summary.sheetsSynced;
      console.log();
    }
  } else {
    const reason = options.skipTavily
      ? 'skipped by flag'
      : !isTavilyConfigured()
        ? 'TAVILY_API_KEY not set'
        : 'TAVILY_ENABLED=false';
    console.log(`--- Step 5/6: Tavily (skipped: ${reason}) ---\n`);
  }

  if (!options.skipDispatch) {
    console.log('--- Step 6/6: Dispatch ---');
    summary.dispatch = await runDispatchApplications();
    console.log(
      `[Pipeline] Dispatch: sent ${summary.dispatch.sent}, failed ${summary.dispatch.failed}, ` +
        `marked failed ${summary.dispatch.markedFailed}.\n`,
    );

    if (!options.skipSheets && summary.dispatch.sent + summary.dispatch.markedFailed > 0) {
      summary.sheetsSynced = (await syncSheetsStep('after dispatch')) || summary.sheetsSynced;
      console.log();
    }
  } else {
    console.log('--- Step 6/6: Dispatch (skipped) ---\n');
  }

  console.log('========== Daily pipeline finished ==========');
  return summary;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  try {
    const summary = await runDailyPipeline(options);

    console.log('\n=== Pipeline summary ===');
    if (summary.sheetsImport) {
      console.log(
        `Sheets import: ${summary.sheetsImport.emailsUpdated} emails, ${summary.sheetsImport.statusesUpdated} statuses`,
      );
    }
    if (summary.scraped !== null) {
      console.log(`Scraped: ${summary.scraped}`);
    }
    if (summary.reclassify) {
      console.log(
        `Reclassify: archived ${summary.reclassify.archived}, active ${summary.reclassify.unchanged + summary.reclassify.typeUpdated}`,
      );
    }
    console.log(`Sheets synced: ${summary.sheetsSynced ? 'yes' : 'no'}`);
    if (summary.tavily) {
      console.log(`Tavily emails saved: ${summary.tavily.saved}`);
    }
    if (summary.dispatch) {
      console.log(
        `Applications sent: ${summary.dispatch.sent}, marked failed: ${summary.dispatch.markedFailed}`,
      );
    }

    if (!options.skipNotify) {
      await sendPipelineNotification(summary);
    }

    if (summary.dispatch && summary.dispatch.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Pipeline] Failed: ${message}`);
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

if (process.argv[1]?.endsWith('runDailyPipeline.ts')) {
  void main();
}
