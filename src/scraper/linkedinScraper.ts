import type { Browser, BrowserContext, Page } from 'playwright';
import { env } from '../config/env.js';
import type { ScrapedVacancy } from '../database/types.js';
import {
  scrapePaginatedSearch,
  sleep,
  getContextOptions,
  recordSoftBlock,
  SoftBlockError,
} from './browser.js';
import { isSessionStale, probeAuthSession } from './sessionProbe.js';
import { buildLinkedInPageUrl } from './pagination.js';
import { processScrapedJobCard } from './scraperUtils.js';
import { mergeVacancies } from './mergeVacancies.js';
import type { JobBoardScraper } from './scraperTypes.js';

function resolveLinkedInUrl(href: string): string {
  if (href.startsWith('http')) {
    return href.split('?')[0] ?? href;
  }

  const path = href.startsWith('/') ? href : `/${href}`;
  return `${env.linkedinBaseUrl}${path.split('?')[0]}`;
}

async function dismissLinkedInModals(page: Page): Promise<void> {
  const dismissSelectors = [
    'button[data-tracking-control-name="public_jobs_contextual-sign-in-modal_modal_dismiss"]',
    'button[aria-label="Dismiss"]',
    'button.artdeco-modal__dismiss',
  ];

  for (const selector of dismissSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1_000 })) {
        await button.click();
        await page.waitForTimeout(500);
      }
    } catch {
      continue;
    }
  }
}

export async function scrapeLinkedInPage(page: Page, context: BrowserContext): Promise<ScrapedVacancy[]> {
  const results: ScrapedVacancy[] = [];
  const seenUrls = new Set<string>();

  await dismissLinkedInModals(page);

  try {
    await page.waitForSelector('div[data-job-id], ul.jobs-search__results-list > li', {
      timeout: 10_000,
    });
  } catch {
    // continue — count check below
  }

  const jobCards = page.locator(
    'div.job-card-container[data-job-id], li.jobs-search-results-list__list-item, ul.jobs-search__results-list > li, div.job-search-card',
  );

  const count = await jobCards.count();
  if (count === 0) {
    console.warn('[LinkedIn] No job cards found. Login may be required — run: npm run auth:linkedin');
    return results;
  }

  console.log(`[LinkedIn] Found ${count} job cards on page`);

  for (let i = 0; i < count; i++) {
    const card = jobCards.nth(i);

    try {
      const titleLocator = card
        .locator(
          '.job-card-container__link, .job-card-list__title a, a[href*="/jobs/view/"], a[data-tracking-control-name="public_jobs_jserp-result_search-card"], h3 a',
        )
        .first();
      const companyLocator = card
        .locator(
          '.artdeco-entity-lockup__subtitle, h4.base-search-card__subtitle, .job-card-container__company-name, a[data-tracking-control-name="public_jobs_jserp-result_job-search-card-subtitle"]',
        )
        .first();
      const snippetLocator = card
        .locator('p.job-search-card__snippet, .job-card-container__description, .job-card-container__metadata-wrapper')
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

      const url = resolveLinkedInUrl(href);

      if (seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);

      const vacancy = await processScrapedJobCard(context, title, company, url, description, 'LinkedIn');
      if (vacancy) {
        results.push(vacancy);
      }
    } catch {
      continue;
    }
  }

  return results;
}

async function scrapeAllLinkedInSearches(browser: Browser): Promise<ScrapedVacancy[]> {
  const merged = new Map<string, ScrapedVacancy>();
  const searchUrls = env.linkedinSearchUrls;
  const contextOptions = getContextOptions(env.linkedinStorageState ?? undefined);
  const sessionPath = env.linkedinStorageState;

  if (sessionPath && searchUrls.length > 0) {
    if (isSessionStale('linkedin', sessionPath)) {
      console.warn(
        `[LinkedIn] Session is older than 7 days — refresh recommended: npm run auth:linkedin`,
      );
    }

    console.log('[LinkedIn] Probing saved session...');
    const probeOk = await probeAuthSession(browser, 'linkedin', searchUrls[0], sessionPath);
    if (!probeOk) {
      console.warn(
        '[LinkedIn] Session probe failed (captcha/login wall or 0 results). Skipping LinkedIn. Run: npm run auth:linkedin',
      );
      recordSoftBlock('linkedin.com', 'session probe failed (expired or captcha)');
      return [];
    }

    console.log('[LinkedIn] Session probe OK.');
  }

  for (let i = 0; i < searchUrls.length; i++) {
    if (i > 0 && env.searchDelayMs > 0) {
      console.log(`[LinkedIn] Waiting ${env.searchDelayMs / 1000}s before next search...`);
      await sleep(env.searchDelayMs);
    }

    try {
      const vacancies = await scrapePaginatedSearch(
        browser,
        searchUrls[i],
        scrapeLinkedInPage,
        {
          maxPages: env.scrapeMaxPages,
          buildPageUrl: buildLinkedInPageUrl,
          contextOptions,
          sourceLabel: 'LinkedIn',
          pageDelayMs: env.scrapePageDelayMs,
        },
      );
      mergeVacancies(merged, vacancies);
    } catch (error) {
      if (error instanceof SoftBlockError) {
        console.warn(`[LinkedIn] Soft block (${error.reason}) — skipping remaining searches.`);
        break;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[LinkedIn] Skipping search after error: ${message}`);
    }
  }

  if (merged.size === 0 && env.linkedinStorageState) {
    console.warn(
      '[LinkedIn] No vacancies with a saved session — the LinkedIn session may be expired. Re-run: npm run auth:linkedin',
    );
    recordSoftBlock('linkedin.com', 'no results with saved session (possibly expired)');
  }

  return [...merged.values()];
}

export const linkedinScraper: JobBoardScraper = {
  name: 'linkedin',
  getSearchUrls: () => env.linkedinSearchUrls,
  scrapeAll: scrapeAllLinkedInSearches,
};

export { scrapeAllLinkedInSearches };
