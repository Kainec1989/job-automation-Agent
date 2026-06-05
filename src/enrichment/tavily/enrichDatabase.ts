import { VacancyRepository } from '../../database/vacancyRepository.js';
import { env } from '../../config/env.js';
import { sleep } from '../../scraper/browser.js';
import { syncDatabaseToSheets } from '../../sheets/syncDatabaseToSheets.js';
import { TavilyApiError } from './client.js';
import { lookupHrEmail } from './emailLookup.js';
import type { TavilyEmailLookupResult } from './types.js';

export interface TavilyEnrichmentSummary {
  processed: number;
  saved: number;
  notFound: number;
  failed: number;
  skipped: number;
}

export interface TavilyEnrichmentOptions {
  limit: number;
  dryRun?: boolean;
  company?: string;
  syncSheets?: boolean;
  onResult?: (label: string, result: TavilyEmailLookupResult, saved: boolean) => void;
}

export async function enrichVacanciesWithTavily(
  options: TavilyEnrichmentOptions,
): Promise<TavilyEnrichmentSummary> {
  const repository = new VacancyRepository();
  const vacancies = repository.findNewWithoutEmailFiltered({
    limit: options.limit,
    company: options.company,
  });

  const summary: TavilyEnrichmentSummary = {
    processed: 0,
    saved: 0,
    notFound: 0,
    failed: 0,
    skipped: 0,
  };

  if (vacancies.length === 0) {
    return summary;
  }

  for (const vacancy of vacancies) {
    if (options.dryRun) {
      summary.skipped += 1;
      continue;
    }

    summary.processed += 1;

    try {
      const result = await lookupHrEmail({
        company: vacancy.company,
        title: vacancy.title,
        jobUrl: vacancy.url,
      });

      let saved = false;
      if (result.email) {
        saved = repository.updateEmailIfNew(vacancy.id, result.email);
        if (saved) {
          summary.saved += 1;
        }
      } else {
        summary.notFound += 1;
      }

      options.onResult?.(`${vacancy.company} — ${vacancy.title}`, result, saved);

      if (env.tavilyLookupDelayMs > 0) {
        await sleep(env.tavilyLookupDelayMs);
      }
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Tavily] Failed for ${vacancy.company}: ${message}`);

      if (error instanceof TavilyApiError && (error.status === 401 || error.status === 429)) {
        break;
      }
    }
  }

  const shouldSync =
    options.syncSheets !== false && summary.saved > 0 && Boolean(env.googleSpreadsheetId);

  if (shouldSync) {
    try {
      await syncDatabaseToSheets();
      console.log('[Tavily] Google Sheets synced after email enrichment.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Tavily] Sheets sync failed: ${message}`);
    }
  }

  return summary;
}
