import type { BrowserContext } from 'playwright';
import type { ScrapedVacancy } from '../database/types.js';
import { recordClassification } from './classificationStats.js';
import { fetchJobDetails } from './fetchJobDescription.js';
import { sanitizeJobFields } from './sanitizeJobFields.js';
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
  const { title: cleanTitle, company: cleanCompany } = sanitizeJobFields(title, company);
  const result = classifyVacancy(cleanTitle, description);
  recordClassification(source, result);

  if (!result.isFit) {
    console.log(`[${source}] Skipped: ${cleanTitle} at ${cleanCompany} — ${result.reason}`);
    return null;
  }

  return {
    title: cleanTitle,
    company: cleanCompany,
    url,
    description,
    email,
    type: result.type,
  };
}
