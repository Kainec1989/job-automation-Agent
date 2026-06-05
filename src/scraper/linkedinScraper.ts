import type { Browser, BrowserContext, Page } from 'playwright';
import { env } from '../config/env.js';
import type { ScrapedVacancy } from '../database/types.js';
import { scrapeSearchUrl, sleep, getContextOptions } from './browser.js';
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

  const jobCards = page.locator(
    'ul.jobs-search__results-list > li, div.job-search-card, li.jobs-search-results__list-item',
  );

  const count = await jobCards.count();
  if (count === 0) {
    console.warn('[LinkedIn] No job cards found. Login may be required — set LINKEDIN_STORAGE_STATE in .env');
    return results;
  }

  for (let i = 0; i < count; i++) {
    const card = jobCards.nth(i);

    try {
      const titleLocator = card
        .locator('a[data-tracking-control-name="public_jobs_jserp-result_search-card"], h3 a, .job-card-list__title a')
        .first();
      const companyLocator = card
        .locator('h4.base-search-card__subtitle, .job-card-container__company-name, a[data-tracking-control-name="public_jobs_jserp-result_job-search-card-subtitle"]')
        .first();
      const snippetLocator = card.locator('p.job-search-card__snippet, .job-card-container__description').first();

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

  for (let i = 0; i < searchUrls.length; i++) {
    if (i > 0 && env.searchDelayMs > 0) {
      console.log(`[LinkedIn] Waiting ${env.searchDelayMs / 1000}s before next search...`);
      await sleep(env.searchDelayMs);
    }

    try {
      const vacancies = await scrapeSearchUrl(
        browser,
        searchUrls[i],
        scrapeLinkedInPage,
        contextOptions,
      );
      mergeVacancies(merged, vacancies);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[LinkedIn] Skipping search after error: ${message}`);
    }
  }

  return [...merged.values()];
}

export const linkedinScraper: JobBoardScraper = {
  name: 'linkedin',
  getSearchUrls: () => env.linkedinSearchUrls,
  scrapeAll: scrapeAllLinkedInSearches,
};

export { scrapeAllLinkedInSearches };
