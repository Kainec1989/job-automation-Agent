import type { Browser, BrowserContext, Page } from 'playwright';
import { env } from '../config/env.js';
import type { ScrapedVacancy } from '../database/types.js';
import {
  getContextOptions,
  recordSoftBlock,
  scrapePaginatedSearch,
  sleep,
  SoftBlockError,
} from './browser.js';
import { isSessionStale, probeAuthSession } from './sessionProbe.js';
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
  const sessionPath = env.indeedStorageState;

  if (sessionPath && searchUrls.length > 0) {
    if (isSessionStale('indeed', sessionPath)) {
      console.warn(`[Indeed] Session is older than 5 days — refresh recommended: npm run auth:indeed`);
    }

    console.log('[Indeed] Probing saved session...');
    const probeOk = await probeAuthSession(browser, 'indeed', searchUrls[0], sessionPath);
    if (!probeOk) {
      console.warn(
        '[Indeed] Session probe failed (403/captcha or 0 results). Skipping Indeed. Run: npm run auth:indeed',
      );
      recordSoftBlock('de.indeed.com', 'session probe failed (expired or blocked)');
      return [];
    }

    console.log('[Indeed] Session probe OK.');
  }

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
      if (error instanceof SoftBlockError) {
        console.warn(`[Indeed] Soft block (${error.reason}) — skipping remaining searches.`);
        break;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Indeed] Skipping search after error: ${message}`);
    }
  }

  if (merged.size === 0 && env.indeedStorageState) {
    console.warn(
      '[Indeed] No vacancies with a saved session — the Indeed session may be expired. Re-run: npm run auth:indeed',
    );
    recordSoftBlock('indeed.com', 'no results with saved session (possibly expired)');
  }

  return [...merged.values()];
}

export const indeedScraper: JobBoardScraper = {
  name: 'indeed',
  getSearchUrls: () => env.indeedSearchUrls,
  scrapeAll: scrapeAllIndeedSearches,
};

export { scrapeAllIndeedSearches };
