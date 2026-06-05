import type { BrowserContext } from 'playwright';
import type { ScrapedVacancy } from '../database/types.js';
import { recordClassification } from './classificationStats.js';
import { fetchJobDetails } from './fetchJobDescription.js';
import { classifyVacancy } from './vacancyClassifier.js';

export async function processScrapedJobCard(
  context: BrowserContext,
  title: string,
  company: string,
  url: string,
  snippet: string | null,
  source: string,
): Promise<ScrapedVacancy | null> {
  const { description, email } = await fetchJobDetails(context, url, snippet);
  return classifyScrapedVacancy(title, company, url, description, source, email);
}

export function classifyScrapedVacancy(
  title: string,
  company: string,
  url: string,
  description: string | null,
  source: string,
  email: string | null = null,
): ScrapedVacancy | null {
  const result = classifyVacancy(title, description);
  recordClassification(source, result);

  if (!result.isFit) {
    console.log(`[${source}] Skipped: ${title} at ${company} — ${result.reason}`);
    return null;
  }

  return {
    title,
    company,
    url,
    description,
    email,
    type: result.type,
  };
}
