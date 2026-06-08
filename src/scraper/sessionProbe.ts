import { statSync } from 'node:fs';
import type { Browser } from 'playwright';
import { detectSoftBlock, getContextOptions, SoftBlockError } from './browser.js';

const SESSION_MAX_AGE_DAYS: Record<'linkedin' | 'indeed', number> = {
  linkedin: 7,
  indeed: 5,
};

export function sessionAgeDays(filePath: string): number | null {
  try {
    const mtime = statSync(filePath).mtimeMs;
    return (Date.now() - mtime) / (1000 * 60 * 60 * 24);
  } catch {
    return null;
  }
}

export function isSessionStale(scraper: 'linkedin' | 'indeed', filePath: string): boolean {
  const age = sessionAgeDays(filePath);
  if (age === null) {
    return true;
  }

  return age > SESSION_MAX_AGE_DAYS[scraper];
}

/**
 * Quick headless check: can we load a search page without captcha/login wall?
 * Returns false when the saved session is likely expired or blocked.
 */
export async function probeAuthSession(
  browser: Browser,
  scraper: 'linkedin' | 'indeed',
  probeUrl: string,
  storageStatePath: string | null,
): Promise<boolean> {
  if (!storageStatePath) {
    return false;
  }

  const context = await browser.newContext(getContextOptions(storageStatePath));
  const page = await context.newPage();

  try {
    const response = await page.goto(probeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    const status = response?.status() ?? 0;
    if (status === 403 || status === 429) {
      return false;
    }

    await page.waitForTimeout(2_500);

    const softBlock = await detectSoftBlock(page);
    if (softBlock) {
      return false;
    }

    if (scraper === 'linkedin') {
      const cards = await page
        .locator(
          'div.job-card-container[data-job-id], li.jobs-search-results-list__list-item, ul.jobs-search__results-list > li',
        )
        .count();
      return cards > 0;
    }

    const cards = await page.locator('[data-jk], .job_seen_beacon, .tapItem, .result').count();
    return cards > 0;
  } catch (error) {
    if (error instanceof SoftBlockError) {
      return false;
    }

    return false;
  } finally {
    await context.close();
  }
}
