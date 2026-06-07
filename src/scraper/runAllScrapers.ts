import { closeDatabase } from '../database/db.js';
import { env } from '../config/env.js';
import { printScraperAuthWarnings } from './authStatus.js';
import { consumeSoftBlockAlerts, launchBrowser, sleep } from './browser.js';
import { isTelegramConfigured, sendTelegramMessage } from '../notifications/telegram.js';
import { indeedScraper } from './indeedScraper.js';
import { stepstoneScraper } from './stepstoneScraper.js';
import { linkedinScraper } from './linkedinScraper.js';
import { arbeitsagenturScraper } from './arbeitsagenturScraper.js';
import { printClassificationStats, resetClassificationStats } from './classificationStats.js';
import { dedupeByCompanyTitle, mergeVacancies } from './mergeVacancies.js';
import { persistVacancies } from './persistVacancies.js';
import type { JobBoardScraper } from './scraperTypes.js';
import type { ScrapedVacancy } from '../database/types.js';

const SCRAPER_REGISTRY: Record<string, JobBoardScraper> = {
  indeed: indeedScraper,
  stepstone: stepstoneScraper,
  linkedin: linkedinScraper,
  arbeitsagentur: arbeitsagenturScraper,
};

function getEnabledScrapers(): JobBoardScraper[] {
  const scrapers = env.enabledScrapers
    .map((name) => SCRAPER_REGISTRY[name])
    .filter((scraper): scraper is JobBoardScraper => scraper !== undefined);

  if (scrapers.length === 0) {
    throw new Error(`No valid scrapers enabled. Check SCRAPERS in .env: ${env.enabledScrapers.join(', ')}`);
  }

  return scrapers;
}

export async function runAllScrapers(): Promise<ScrapedVacancy[]> {
  const scrapers = getEnabledScrapers();
  const browser = await launchBrowser();
  const merged = new Map<string, ScrapedVacancy>();

  try {
    for (let i = 0; i < scrapers.length; i++) {
      const scraper = scrapers[i];

      if (i > 0 && env.searchDelayMs > 0) {
        console.log(`Waiting ${env.searchDelayMs / 1000}s before next job board...`);
        await sleep(env.searchDelayMs);
      }

      console.log(`\n=== [${scraper.name.toUpperCase()}] Starting scrape ===`);
      console.log(`Search URLs: ${scraper.getSearchUrls().length}`);

      try {
        const vacancies = await scraper.scrapeAll(browser);
        mergeVacancies(merged, vacancies);
        console.log(`[${scraper.name}] Collected ${vacancies.length} vacancies`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[${scraper.name}] Scraper failed: ${message}`);
      }
    }
  } finally {
    await browser.close();
  }

  return [...merged.values()];
}

async function reportSoftBlocks(): Promise<void> {
  const alerts = consumeSoftBlockAlerts();
  if (alerts.length === 0) {
    return;
  }

  const lines = alerts.map((alert) => `• ${alert.host}: ${alert.reason}`);
  console.warn(`[Scraper] Soft blocks detected:\n${lines.join('\n')}`);

  if (!isTelegramConfigured()) {
    return;
  }

  try {
    await sendTelegramMessage(
      ['⚠️ Скрапер заблокирован / сессия истекла:', '', ...lines].join('\n'),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Scraper] Could not send soft-block alert: ${message}`);
  }
}

function logScraperSettings(): void {
  console.log(`Enabled scrapers: ${env.enabledScrapers.join(', ')}`);
  console.log(`Junior keywords: ${env.keywordsJunior.join(', ')}`);
  console.log(`Praktikum keywords: ${env.keywordsPraktikum.join(', ')}`);
  console.log(`Search location: ${env.searchLocation} (radius ${env.searchRadiusKm} km)`);
  console.log(`Delay between searches: ${env.searchDelayMs / 1000}s`);
  console.log(
    `Full description fetch: ${env.fetchFullDescription ? `on (${env.descriptionFetchDelayMs / 1000}s between jobs)` : 'off'}`,
  );
  console.log(`Email extraction: ${env.extractEmail ? 'on' : 'off'}`);
  console.log(`Pagination: ${env.scrapeMaxPages} page(s), ${env.scrapePageDelayMs / 1000}s between pages`);
  console.log(`Browser headless: ${env.browserHeadless}`);
}

export async function scrapeAndPersist(): Promise<number> {
  logScraperSettings();
  printScraperAuthWarnings();
  resetClassificationStats();

  const rawVacancies = await runAllScrapers();
  printClassificationStats();
  await reportSoftBlocks();

  const vacancies = dedupeByCompanyTitle(rawVacancies);
  const duplicates = rawVacancies.length - vacancies.length;
  if (duplicates > 0) {
    console.log(`Cross-board dedup: removed ${duplicates} duplicate posting(s).`);
  }

  for (const vacancy of vacancies) {
    console.log(`- [${vacancy.type}] [${vacancy.company}] ${vacancy.title} → ${vacancy.url}`);
  }

  if (vacancies.length > 0) {
    await persistVacancies(vacancies);
  } else {
    console.log('No vacancies collected.');
  }

  return vacancies.length;
}

async function main(): Promise<void> {
  try {
    await scrapeAndPersist();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Scraper pipeline failed: ${message}`);
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

if (process.argv[1]?.endsWith('runAllScrapers.ts')) {
  void main();
}
