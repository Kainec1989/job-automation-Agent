import type { BrowserContext, Page } from 'playwright';
import { env } from '../config/env.js';
import { sleep } from './browser.js';
import { extractHrEmailFromTexts } from './hrEmailValidation.js';

export interface JobDetails {
  description: string | null;
  email: string | null;
}

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

async function extractMailtoEmails(page: Page): Promise<string[]> {
  try {
    const hrefs = await page.locator('a[href^="mailto:"]').evaluateAll((links) =>
      links
        .map((link) => link.getAttribute('href') ?? '')
        .filter(Boolean),
    );

    return hrefs
      .map((href) => href.replace(/^mailto:/i, '').split('?')[0]?.trim() ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function extractPageText(page: Page, url: string): Promise<string | null> {
  const description = await extractDescription(page, url);
  if (description) {
    return description;
  }

  try {
    const bodyText = await page.locator('body').innerText({ timeout: 4_000 });
    return bodyText.replace(/\s+/g, ' ').trim() || null;
  } catch {
    return null;
  }
}

function buildJobDetails(
  snippet: string | null,
  pageText: string | null,
  mailtoEmails: string[],
  company?: string | null,
): JobDetails {
  const description = env.fetchFullDescription
    ? mergeDescriptions(snippet, pageText)
    : snippet;

  const email = env.extractEmail
    ? extractHrEmailFromTexts(company, ...mailtoEmails, description, pageText, snippet)
    : null;

  return { description, email };
}

export async function fetchJobDetails(
  context: BrowserContext,
  url: string,
  snippet: string | null,
  company?: string | null,
): Promise<JobDetails> {
  if (!env.fetchFullDescription && !env.extractEmail) {
    return { description: snippet, email: null };
  }

  if (!env.fetchFullDescription && env.extractEmail) {
    return {
      description: snippet,
      email: extractHrEmailFromTexts(company, snippet),
    };
  }

  let detailPage: Page | null = null;

  try {
    detailPage = await context.newPage();
    const response = await detailPage.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    if (!response?.ok()) {
      return buildJobDetails(snippet, null, [], company);
    }

    await detailPage.waitForTimeout(1_500);
    const pageText = await extractPageText(detailPage, url);
    const mailtoEmails = env.extractEmail ? await extractMailtoEmails(detailPage) : [];
    const details = buildJobDetails(snippet, pageText, mailtoEmails, company);

    if (pageText && details.description && details.description.length > (snippet?.length ?? 0)) {
      console.log(`[Description] Enriched (${details.description.length} chars): ${url}`);
    }

    if (details.email) {
      console.log(`[Email] Found ${details.email}: ${url}`);
    }

    if (env.descriptionFetchDelayMs > 0) {
      await sleep(env.descriptionFetchDelayMs);
    }

    return details;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Description] Failed for ${url}: ${message}`);
    return buildJobDetails(snippet, null, [], company);
  } finally {
    await detailPage?.close();
  }
}

/** @deprecated Используй fetchJobDetails */
export async function fetchFullJobDescription(
  context: BrowserContext,
  url: string,
  snippet: string | null,
): Promise<string | null> {
  const details = await fetchJobDetails(context, url, snippet);
  return details.description;
}
