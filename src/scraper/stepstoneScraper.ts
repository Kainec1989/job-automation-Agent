import type { Browser, BrowserContext, Page } from 'playwright';
import { env } from '../config/env.js';
import type { ScrapedVacancy } from '../database/types.js';
import { scrapePaginatedSearch, sleep } from './browser.js';
import { buildStepstonePageUrl } from './pagination.js';
import { processJobCardsWithConcurrency, type JobCardInput } from './processJobCards.js';
import { mergeVacancies } from './mergeVacancies.js';
import type { JobBoardScraper } from './scraperTypes.js';

function resolveStepstoneUrl(href: string): string {
  if (href.startsWith('http')) {
    return href;
  }

  return `${env.stepstoneBaseUrl}${href.startsWith('/') ? href : `/${href}`}`;
}

export async function scrapeStepstonePage(page: Page, context: BrowserContext): Promise<ScrapedVacancy[]> {
  const seenUrls = new Set<string>();
  const pending: JobCardInput[] = [];

  const jobCards = page.locator(
    'article[data-at="job-item"], article[data-testid="job-item"], li[data-testid="job-item"]',
  );

  const count = await jobCards.count();
  if (count === 0) {
    console.warn('[Stepstone] No job cards found. Selectors may need updating or the page blocked the request.');
    return [];
  }

  for (let i = 0; i < count; i++) {
    const card = jobCards.nth(i);

    try {
      const titleLocator = card
        .locator('a[data-at="job-item-title"], h2 a, a[data-testid="job-item-title"]')
        .first();
      const companyLocator = card
        .locator('span[data-at="job-item-company-name"], [data-testid="job-card-company-name"], a[data-at="job-item-company-name"]')
        .first();
      const snippetLocator = card.locator('[data-at="job-card-summary"], [data-testid="job-card-summary"]').first();

      const title = (await titleLocator.innerText({ timeout: 3_000 })).trim();
      const company = (await companyLocator.innerText({ timeout: 3_000 })).trim();
      const href = await titleLocator.getAttribute('href');

      let description: string | null = null;
      try {
        description = (await snippetLocator.innerText({ timeout: 1_000 })).trim() || null;
      } catch {
        description = null;
      }

      if (!title || !company || !href) {
        continue;
      }

      const url = resolveStepstoneUrl(href);

      if (seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);

      pending.push({ title, company, url, snippet: description });
    } catch {
      continue;
    }
  }

  return processJobCardsWithConcurrency(context, pending, 'Stepstone');
}

async function scrapeAllStepstoneSearches(browser: Browser): Promise<ScrapedVacancy[]> {
  const merged = new Map<string, ScrapedVacancy>();
  const searchUrls = env.stepstoneSearchUrls;

  for (let i = 0; i < searchUrls.length; i++) {
    if (i > 0 && env.searchDelayMs > 0) {
      console.log(`[Stepstone] Waiting ${env.searchDelayMs / 1000}s before next search...`);
      await sleep(env.searchDelayMs);
    }

    try {
      const vacancies = await scrapePaginatedSearch(
        browser,
        searchUrls[i],
        scrapeStepstonePage,
        {
          maxPages: env.scrapeMaxPages,
          buildPageUrl: buildStepstonePageUrl,
          sourceLabel: 'Stepstone',
          pageDelayMs: env.scrapePageDelayMs,
        },
      );
      mergeVacancies(merged, vacancies);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Stepstone] Skipping search after error: ${message}`);
    }
  }

  return [...merged.values()];
}

export const stepstoneScraper: JobBoardScraper = {
  name: 'stepstone',
  getSearchUrls: () => env.stepstoneSearchUrls,
  scrapeAll: scrapeAllStepstoneSearches,
};

export { scrapeAllStepstoneSearches };
