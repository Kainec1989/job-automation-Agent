import type { Browser } from 'playwright';
import type { ScrapedVacancy } from '../database/types.js';

export interface JobBoardScraper {
  readonly name: string;
  getSearchUrls(): readonly string[];
  scrapeAll(browser: Browser): Promise<ScrapedVacancy[]>;
}
