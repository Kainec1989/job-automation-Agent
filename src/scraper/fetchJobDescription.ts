import type { BrowserContext, Page } from 'playwright';
import { env } from '../config/env.js';
import { sleep } from './browser.js';

const MAX_DESCRIPTION_LENGTH = 8000;
const MIN_USEFUL_TEXT_LENGTH = 80;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function mergeDescriptions(snippet: string | null, full: string | null): string | null {
  const parts = [snippet?.trim(), full?.trim()].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return null;
  }

  const uniqueParts = parts.filter((part, index) => index === 0 || !parts[0]!.includes(part));
  return normalizeText(uniqueParts.join(' ')).slice(0, MAX_DESCRIPTION_LENGTH);
}

async function readFirstMatchingText(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      const count = await locator.count();

      if (count === 0) {
        continue;
      }

      const text = normalizeText(await locator.innerText({ timeout: 4_000 }));

      if (text.length >= MIN_USEFUL_TEXT_LENGTH) {
        return text;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function extractIndeedDescription(page: Page): Promise<string | null> {
  return readFirstMatchingText(page, [
    '#jobDescriptionText',
    '[id="job-description"]',
    '.jobsearch-JobComponent-description',
    '[data-testid="jobsearch-JobComponent-description"]',
  ]);
}

async function extractStepstoneDescription(page: Page): Promise<string | null> {
  return readFirstMatchingText(page, [
    '[data-at="job-ad-content"]',
    '[data-testid="job-ad-content"]',
    'section[data-at="job-ad-content"]',
    '.at-section-text-description-content',
  ]);
}

async function extractLinkedInDescription(page: Page): Promise<string | null> {
  try {
    const showMore = page.locator('button.show-more-less-html__button[aria-expanded="false"]').first();

    if (await showMore.isVisible({ timeout: 1_500 })) {
      await showMore.click();
      await page.waitForTimeout(500);
    }
  } catch {
    // optional expand
  }

  return readFirstMatchingText(page, [
    '.description__text',
    '.show-more-less-html__markup',
    '[data-testid="job-description"]',
    '.jobs-description__content',
  ]);
}

async function extractCodewerkDescription(page: Page): Promise<string | null> {
  return readFirstMatchingText(page, [
    '[class*="elementor-widget-theme-post-content"]',
    '.entry-content',
  ]);
}

async function extractGenericDescription(page: Page): Promise<string | null> {
  return readFirstMatchingText(page, [
    '[class*="elementor-widget-theme-post-content"]',
    'article .entry-content',
    'article',
    '[class*="job-description"]',
    '[class*="stellenanzeige"]',
    'main',
  ]);
}

async function extractDescription(page: Page, url: string): Promise<string | null> {
  const host = new URL(url).hostname.toLowerCase();

  if (host.includes('indeed.')) {
    return extractIndeedDescription(page);
  }

  if (host.includes('stepstone.')) {
    return extractStepstoneDescription(page);
  }

  if (host.includes('linkedin.')) {
    return extractLinkedInDescription(page);
  }

  if (host.includes('codewerk.de')) {
    return extractCodewerkDescription(page);
  }

  return extractGenericDescription(page);
}

export async function fetchFullJobDescription(
  context: BrowserContext,
  url: string,
  snippet: string | null,
): Promise<string | null> {
  if (!env.fetchFullDescription) {
    return snippet;
  }

  let detailPage: Page | null = null;

  try {
    detailPage = await context.newPage();
    const response = await detailPage.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    if (!response?.ok()) {
      return snippet;
    }

    await detailPage.waitForTimeout(1_500);
    const fullText = await extractDescription(detailPage, url);
    const merged = mergeDescriptions(snippet, fullText);

    if (fullText && merged && merged.length > (snippet?.length ?? 0)) {
      console.log(`[Description] Enriched (${merged.length} chars): ${url}`);
    }

    if (env.descriptionFetchDelayMs > 0) {
      await sleep(env.descriptionFetchDelayMs);
    }

    return merged;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Description] Failed for ${url}: ${message}`);
    return snippet;
  } finally {
    await detailPage?.close();
  }
}
