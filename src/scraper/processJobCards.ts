import type { BrowserContext } from 'playwright';
import type { ScrapedVacancy } from '../database/types.js';
import { env } from '../config/env.js';
import { sleep } from './browser.js';
import { processScrapedJobCard } from './scraperUtils.js';

export interface JobCardInput {
  title: string;
  company: string;
  url: string;
  snippet: string | null;
}

export async function processJobCardsWithConcurrency(
  context: BrowserContext,
  cards: JobCardInput[],
  source: string,
  concurrency = env.descriptionFetchConcurrency,
): Promise<ScrapedVacancy[]> {
  if (cards.length === 0) {
    return [];
  }

  const limit = Math.max(1, concurrency);
  const results: ScrapedVacancy[] = [];

  for (let offset = 0; offset < cards.length; offset += limit) {
    const batch = cards.slice(offset, offset + limit);
    const batchResults = await Promise.all(
      batch.map((card) =>
        processScrapedJobCard(context, card.title, card.company, card.url, card.snippet, source),
      ),
    );

    for (const vacancy of batchResults) {
      if (vacancy) {
        results.push(vacancy);
      }
    }

    const hasMore = offset + limit < cards.length;
    if (hasMore && env.descriptionFetchDelayMs > 0) {
      await sleep(env.descriptionFetchDelayMs);
    }
  }

  return results;
}
