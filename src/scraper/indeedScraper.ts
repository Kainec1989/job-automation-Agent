import type { Browser, BrowserContext, Page } from 'playwright';
import { env } from '../config/env.js';
import type { ScrapedVacancy } from '../database/types.js';
import { getContextOptions, scrapePaginatedSearch, sleep } from './browser.js';
import { buildIndeedPageUrl } from './pagination.js';
import { processScrapedJobCard } from './scraperUtils.js';
import { mergeVacancies } from './mergeVacancies.js';
import type { JobBoardScraper } from './scraperTypes.js';

export async function scrapeIndeedPage(page: Page, context: BrowserContext): Promise<ScrapedVacancy[]> {
  const results: ScrapedVacancy[] = [];
  const seenUrls = new Set<string>();

  const jobCards = page.locator('[data-jk], .job_seen_beacon, .tapItem, .result');

  const count = await jobCards.count();
  if (count === 0) {
    console.warn('[Indeed] No job cards found. Selectors may need updating or the page blocked the request.');
    return results;
  }

  for (let i = 0; i < count; i++) {
    const card = jobCards.nth(i);

    try {
      const titleLocator = card.locator('h2.jobTitle a, a.jcs-JobTitle, [data-testid="job-title"] a').first();
      const companyLocator = card
        .locator('[data-testid="company-name"], .companyName, span.companyName')
        .first();
      const snippetLocator = card
        .locator('.job-snippet, [data-testid="job-snippet"], .underShelfFooter')
        .first();

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

      const url = href.startsWith('http') ? href : `${env.indeedBaseUrl}${href}`;

      if (seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);

      const vacancy = await processScrapedJobCard(context, title, company, url, description, 'Indeed');
      if (vacancy) {
        results.push(vacancy);
      }
    } catch {
      continue;
    }
  }

  return results;
}

async function scrapeAllIndeedSearches(browser: Browser): Promise<ScrapedVacancy[]> {
  const merged = new Map<string, ScrapedVacancy>();
  const searchUrls = env.indeedSearchUrls;
  const contextOptions = getContextOptions(env.indeedStorageState ?? undefined);

  for (let i = 0; i < searchUrls.length; i++) {
    if (i > 0 && env.searchDelayMs > 0) {
      console.log(`[Indeed] Waiting ${env.searchDelayMs / 1000}s before next search...`);
      await sleep(env.searchDelayMs);
    }

    try {
      const vacancies = await scrapePaginatedSearch(
        browser,
        searchUrls[i],
        scrapeIndeedPage,
        {
          maxPages: env.scrapeMaxPages,
          buildPageUrl: buildIndeedPageUrl,
          contextOptions,
          sourceLabel: 'Indeed',
          pageDelayMs: env.scrapePageDelayMs,
        },
      );
      mergeVacancies(merged, vacancies);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Indeed] Skipping search after error: ${message}`);
    }
  }

  return [...merged.values()];
}

export const indeedScraper: JobBoardScraper = {
  name: 'indeed',
  getSearchUrls: () => env.indeedSearchUrls,
  scrapeAll: scrapeAllIndeedSearches,
};

export { scrapeAllIndeedSearches };
