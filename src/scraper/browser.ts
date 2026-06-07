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

export class SoftBlockError extends Error {
  constructor(
    public readonly host: string,
    public readonly reason: string,
  ) {
    super(`Soft block on ${host}: ${reason}`);
    this.name = 'SoftBlockError';
  }
}

interface SoftBlockAlert {
  host: string;
  reason: string;
}

const softBlockAlerts: SoftBlockAlert[] = [];

export function recordSoftBlock(host: string, reason: string): void {
  if (!softBlockAlerts.some((alert) => alert.host === host && alert.reason === reason)) {
    softBlockAlerts.push({ host, reason });
  }
}

/** Returns and clears accumulated soft-block alerts collected during the current run. */
export function consumeSoftBlockAlerts(): SoftBlockAlert[] {
  const alerts = [...softBlockAlerts];
  softBlockAlerts.length = 0;
  return alerts;
}

const SOFT_BLOCK_MARKERS = [
  'captcha',
  'verify you are human',
  'are you a robot',
  'unusual traffic',
  'ungewöhnliche aktivität',
  'bitte bestätigen',
  'zugriff verweigert',
  'access denied',
  'attention required',
  'cf-chl',
];

/** Heuristically detects captcha / login walls so an empty result isn't mistaken for "no jobs". */
export async function detectSoftBlock(page: Page): Promise<string | null> {
  try {
    const url = page.url().toLowerCase();
    if (url.includes('authwall') || url.includes('/checkpoint') || url.includes('captcha')) {
      return 'login/checkpoint wall';
    }

    const title = (await page.title().catch(() => '')).toLowerCase();
    const bodyText = (
      await page
        .locator('body')
        .innerText({ timeout: 2_000 })
        .catch(() => '')
    )
      .toLowerCase()
      .slice(0, 3_000);

    const haystack = `${title}\n${bodyText}`;
    const marker = SOFT_BLOCK_MARKERS.find((needle) => haystack.includes(needle));
    if (marker) {
      return `marker: ${marker}`;
    }

    const challengeFrames = await page
      .locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"]')
      .count()
      .catch(() => 0);
    if (challengeFrames > 0) {
      return 'captcha iframe';
    }

    return null;
  } catch {
    return null;
  }
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
  const host = new URL(searchUrl).hostname;
  const maxAttempts = Math.max(1, env.scrapeMaxRetries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`Navigating to: ${searchUrl}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
      const response = await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      const status = response?.status() ?? 0;
      if (!response || !response.ok()) {
        // 403/429 are anti-bot blocks — don't waste retries hammering them.
        if (status === 403 || status === 429) {
          logBlockedPageHelp(status, searchUrl);
          recordSoftBlock(host, `HTTP ${status}`);
          throw new SoftBlockError(host, `HTTP ${status}`);
        }

        if (status >= 500 && attempt < maxAttempts) {
          console.warn(`[Browser] ${host} returned ${status}, retrying...`);
          await sleep(2_000 * attempt);
          continue;
        }

        throw new Error(`Page load failed with status: ${status || 'unknown'}`);
      }

      await page.waitForTimeout(2_500);
      const vacancies = await scrapePage(page, context);

      if (vacancies.length === 0) {
        const reason = await detectSoftBlock(page);
        if (reason) {
          recordSoftBlock(host, reason);
          throw new SoftBlockError(host, reason);
        }
      }

      return vacancies;
    } catch (error) {
      if (error instanceof SoftBlockError) {
        throw error;
      }

      if (attempt < maxAttempts) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[Browser] Navigation error (${message}), retrying ${attempt}/${maxAttempts - 1}...`);
        await sleep(2_000 * attempt);
        continue;
      }

      throw error;
    }
  }

  return [];
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
        if (error instanceof SoftBlockError) {
          console.warn(
            `[${sourceLabel}] Soft block detected (${error.reason}) — stopping pagination.`,
          );
          break;
        }

        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[${sourceLabel}] Page ${pageIndex + 1} failed: ${message} — skipping page.`);
        continue;
      }
    }
  } finally {
    await context.close();
  }

  const results = [...merged.values()];
  console.log(`[${sourceLabel}] Total from search: ${results.length} vacancies`);
  return results;
}
