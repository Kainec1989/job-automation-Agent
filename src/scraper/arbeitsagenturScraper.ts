import type { Browser } from 'playwright';
import { env } from '../config/env.js';
import type { ScrapedVacancy } from '../database/types.js';
import {
  fetchArbeitsagenturBewerbungEmail,
  fetchArbeitsagenturJobDetails,
} from './arbeitsagenturApi.js';
import { sleep } from './browser.js';
import { mergeVacancies } from './mergeVacancies.js';
import { classifyScrapedVacancy } from './scraperUtils.js';
import type { JobBoardScraper } from './scraperTypes.js';

// Public Bundesagentur für Arbeit job search API — JSON, no browser/captcha required.
const API_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs';
const API_KEY = 'jobboerse-jobsuche';
const DETAIL_BASE = 'https://www.arbeitsagentur.de/jobsuche/jobdetail/';
const PAGE_SIZE = 25;
const MIN_DESCRIPTION_LENGTH = 80;

interface ArbeitsagenturJob {
  titel?: string;
  beruf?: string;
  arbeitgeber?: string;
  refnr?: string;
  stellenbeschreibung?: string;
  arbeitsort?: { ort?: string };
}

interface ArbeitsagenturResponse {
  stellenangebote?: ArbeitsagenturJob[];
}

function buildDetailUrl(refnr: string): string {
  return `${DETAIL_BASE}${encodeURIComponent(refnr)}`;
}

async function searchPage(keywords: string, page: number): Promise<ArbeitsagenturJob[]> {
  const params = new URLSearchParams({
    was: keywords,
    wo: env.searchLocation,
    umkreis: String(env.searchRadiusKm),
    angebotsart: '1',
    page: String(page),
    size: String(PAGE_SIZE),
  });

  const response = await fetch(`${API_URL}?${params.toString()}`, {
    headers: { 'X-API-Key': API_KEY, Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Arbeitsagentur API returned ${response.status}`);
  }

  const data = (await response.json()) as ArbeitsagenturResponse;
  return data.stellenangebote ?? [];
}

async function scrapeKeywordSet(
  query: string,
  merged: Map<string, ScrapedVacancy>,
): Promise<void> {
  if (!query.trim()) {
    return;
  }

  for (let page = 1; page <= env.scrapeMaxPages; page += 1) {
    let jobs: ArbeitsagenturJob[];
    try {
      jobs = await searchPage(query, page);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Arbeitsagentur] Page ${page} failed: ${message}`);
      break;
    }

    if (jobs.length === 0) {
      break;
    }

    const collected: ScrapedVacancy[] = [];
    const candidates = jobs
      .map((job) => {
        const title = (job.titel || job.beruf || '').trim();
        const company = (job.arbeitgeber || '').trim();
        const refnr = job.refnr?.trim();
        if (!title || !company || !refnr) {
          return null;
        }

        return {
          title,
          company,
          url: buildDetailUrl(refnr),
          description: job.stellenbeschreibung ?? null,
          refnr,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const concurrency = env.descriptionFetchConcurrency;
    for (let offset = 0; offset < candidates.length; offset += concurrency) {
      const batch = candidates.slice(offset, offset + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          let description = item.description;
          if (!description || description.length < MIN_DESCRIPTION_LENGTH) {
            const details = await fetchArbeitsagenturJobDetails(item.refnr);
            description = details.description ?? description;
          }

          const email = await fetchArbeitsagenturBewerbungEmail(item.refnr);

          return classifyScrapedVacancy(
            item.title,
            item.company,
            item.url,
            description,
            'Arbeitsagentur',
            email,
          );
        }),
      );

      for (const vacancy of batchResults) {
        if (vacancy) {
          collected.push(vacancy);
        }
      }
    }

    console.log(`[Arbeitsagentur] Page ${page}: ${jobs.length} jobs, ${collected.length} accepted`);
    mergeVacancies(merged, collected);

    if (jobs.length < PAGE_SIZE) {
      break;
    }

    if (page < env.scrapeMaxPages && env.scrapePageDelayMs > 0) {
      await sleep(env.scrapePageDelayMs);
    }
  }
}

async function scrapeAllArbeitsagentur(_browser: Browser): Promise<ScrapedVacancy[]> {
  const merged = new Map<string, ScrapedVacancy>();
  // One query per keyword entry (joining them over-constrains the search).
  for (const keyword of [...env.keywordsJunior, ...env.keywordsPraktikum]) {
    await scrapeKeywordSet(keyword, merged);
  }
  return [...merged.values()];
}

export const arbeitsagenturScraper: JobBoardScraper = {
  name: 'arbeitsagentur',
  getSearchUrls: () => [API_URL],
  scrapeAll: scrapeAllArbeitsagentur,
};

export { scrapeAllArbeitsagentur };
