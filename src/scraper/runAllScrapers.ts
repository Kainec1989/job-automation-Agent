import { closeDatabase } from '../database/db.js';
import { env } from '../config/env.js';
import { printScraperAuthWarnings } from './authStatus.js';
import { launchBrowser, sleep } from './browser.js';
import { indeedScraper } from './indeedScraper.js';
import { stepstoneScraper } from './stepstoneScraper.js';
import { linkedinScraper } from './linkedinScraper.js';
import { printClassificationStats, resetClassificationStats } from './classificationStats.js';
import { mergeVacancies } from './mergeVacancies.js';
import { persistVacancies } from './persistVacancies.js';
import type { JobBoardScraper } from './scraperTypes.js';
import type { ScrapedVacancy } from '../database/types.js';

const SCRAPER_REGISTRY: Record<string, JobBoardScraper> = {
  indeed: indeedScraper,
  stepstone: stepstoneScraper,
  linkedin: linkedinScraper,
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

async function main(): Promise<void> {
  try {
    console.log(`Enabled scrapers: ${env.enabledScrapers.join(', ')}`);
    console.log(`Junior keywords: ${env.keywordsJunior.join(', ')}`);
    console.log(`Praktikum keywords: ${env.keywordsPraktikum.join(', ')}`);
    console.log(`Search location: ${env.searchLocation} (radius ${env.searchRadiusKm} km)`);
    console.log(`Delay between searches: ${env.searchDelayMs / 1000}s`);
    console.log(
      `Full description fetch: ${env.fetchFullDescription ? `on (${env.descriptionFetchDelayMs / 1000}s between jobs)` : 'off'}`,
    );
    console.log(`Browser headless: ${env.browserHeadless}`);

    printScraperAuthWarnings();
    resetClassificationStats();
    const vacancies = await runAllScrapers();
    printClassificationStats();

    for (const vacancy of vacancies) {
      console.log(`- [${vacancy.type}] [${vacancy.company}] ${vacancy.title} → ${vacancy.url}`);
    }

    if (vacancies.length > 0) {
      await persistVacancies(vacancies);
    } else {
      console.log('No vacancies collected.');
    }
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
