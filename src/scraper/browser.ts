import { existsSync } from 'node:fs';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type LaunchOptions,
  type Page,
} from 'playwright';
import { env } from '../config/env.js';
import { mergeVacancies } from './mergeVacancies.js';
import type { PageUrlBuilder } from './pagination.js';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CHROME_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
];

const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
`;

function getBrowserLaunchOptions(headless = env.browserHeadless): LaunchOptions {
  const options: LaunchOptions = {
    headless,
    args: CHROME_LAUNCH_ARGS,
  };

  if (env.chromePath) {
    if (!existsSync(env.chromePath)) {
      throw new Error(`CHROME_PATH not found: ${env.chromePath}`);
    }
    options.executablePath = env.chromePath;
  }

  return options;
}

export async function launchBrowser(options?: { headless?: boolean }): Promise<Browser> {
  const headless = options?.headless ?? env.browserHeadless;

  if (env.chromePath) {
    console.log(`Using system browser: ${env.chromePath} (headless: ${headless})`);
  }

  return chromium.launch(getBrowserLaunchOptions(headless));
}

export function getContextOptions(storageStatePath?: string): BrowserContextOptions {
  const options: BrowserContextOptions = {
    userAgent: USER_AGENT,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  };

  if (storageStatePath) {
    if (existsSync(storageStatePath)) {
      options.storageState = storageStatePath;
      console.log(`Using saved browser session: ${storageStatePath}`);
    } else {
      console.warn(`[Browser] Session file not found: ${storageStatePath}`);
    }
  }

  return options;
}

export function logBlockedPageHelp(status: number, url: string): void {
  if (status !== 403 && status !== 429) {
    return;
  }

  const host = new URL(url).hostname;
  console.warn(`\n[Browser] ${status} от ${host} — антибот-защита (Cloudflare / rate limit).`);
  console.warn('Что попробовать:');
  console.warn('  1. npm run auth:indeed  или  npm run auth:linkedin  — сохранить cookies вручную');
  console.warn('  2. В .env: BROWSER_HEADLESS=false  — видимый браузер (реже блокируют)');
  console.warn('  3. В .env: SCRAPERS=stepstone,linkedin  — пропустить заблокированный сайт');
  console.warn('  4. Увеличить SEARCH_DELAY_MS (например 60000)\n');
}

export interface PaginatedScrapeOptions {
  maxPages: number;
  buildPageUrl: PageUrlBuilder;
  contextOptions?: BrowserContextOptions;
  sourceLabel?: string;
  pageDelayMs?: number;
}

async function navigateAndScrapePage(
  page: Page,
  context: BrowserContext,
  searchUrl: string,
  scrapePage: (
    page: Page,
    context: BrowserContext,
  ) => Promise<import('../database/types.js').ScrapedVacancy[]>,
): Promise<import('../database/types.js').ScrapedVacancy[]> {
  console.log(`Navigating to: ${searchUrl}`);
  const response = await page.goto(searchUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const status = response?.status() ?? 0;
  if (!response || !response.ok()) {
    logBlockedPageHelp(status, searchUrl);
    throw new Error(`Page load failed with status: ${status || 'unknown'}`);
  }

  await page.waitForTimeout(2_500);
  return scrapePage(page, context);
}

export async function scrapeSearchUrl(
  browser: Browser,
  searchUrl: string,
  scrapePage: (
    page: Page,
    context: BrowserContext,
  ) => Promise<import('../database/types.js').ScrapedVacancy[]>,
  contextOptions?: BrowserContextOptions,
): Promise<import('../database/types.js').ScrapedVacancy[]> {
  const context = await browser.newContext(contextOptions ?? getContextOptions());
  await context.addInitScript(STEALTH_INIT_SCRIPT);

  const page = await context.newPage();

  try {
    const vacancies = await navigateAndScrapePage(page, context, searchUrl, scrapePage);
    console.log(`Scraped ${vacancies.length} vacancies from ${searchUrl}`);
    return vacancies;
  } finally {
    await context.close();
  }
}

export async function scrapePaginatedSearch(
  browser: Browser,
  baseSearchUrl: string,
  scrapePage: (
    page: Page,
    context: BrowserContext,
  ) => Promise<import('../database/types.js').ScrapedVacancy[]>,
  options: PaginatedScrapeOptions,
): Promise<import('../database/types.js').ScrapedVacancy[]> {
  const {
    maxPages,
    buildPageUrl,
    contextOptions,
    sourceLabel = 'Scraper',
    pageDelayMs = 0,
  } = options;

  const merged = new Map<string, import('../database/types.js').ScrapedVacancy>();
  const context = await browser.newContext(contextOptions ?? getContextOptions());
  await context.addInitScript(STEALTH_INIT_SCRIPT);
  const page = await context.newPage();

  try {
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      if (pageIndex > 0 && pageDelayMs > 0) {
        console.log(`[${sourceLabel}] Waiting ${pageDelayMs / 1000}s before page ${pageIndex + 1}...`);
        await sleep(pageDelayMs);
      }

      const searchUrl = buildPageUrl(baseSearchUrl, pageIndex);
      console.log(`[${sourceLabel}] Page ${pageIndex + 1}/${maxPages}`);

      try {
        const vacancies = await navigateAndScrapePage(page, context, searchUrl, scrapePage);
        const before = merged.size;
        mergeVacancies(merged, vacancies);
        const added = merged.size - before;

        console.log(
          `[${sourceLabel}] Page ${pageIndex + 1}: ${vacancies.length} cards, ${added} new accepted`,
        );

        if (vacancies.length === 0) {
          console.log(`[${sourceLabel}] No cards on page ${pageIndex + 1}, stopping pagination.`);
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[${sourceLabel}] Page ${pageIndex + 1} failed: ${message}`);
        break;
      }
    }
  } finally {
    await context.close();
  }

  const results = [...merged.values()];
  console.log(`[${sourceLabel}] Total from search: ${results.length} vacancies`);
  return results;
}
