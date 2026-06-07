import { AGGREGATOR_HOSTS } from './constants.js';
import type { TavilyEmailLookupInput } from './types.js';

export interface HrEmailQueryStrategy {
  name: string;
  query: string;
}

/** Domain hint from the scraped job URL — only when it is a real company site, not an aggregator. */
export function domainHintsFromUrl(jobUrl?: string | null): string[] {
  if (!jobUrl) {
    return [];
  }

  try {
    const host = new URL(jobUrl).hostname.toLowerCase().replace(/^www\./, '');
    if (AGGREGATOR_HOSTS.some((blocked) => host.includes(blocked))) {
      return [];
    }

    const base = host.split('.')[0] ?? '';
    return base.length >= 3 ? [base, host] : [];
  } catch {
    return [];
  }
}

const LEGAL_SUFFIX_REGEX =
  /\b(gmbh|ag|ug|kg|ohg|se|inc|ltd|llc|group|gruppe|co\.?|corp|corporation)\b/gi;

export function compactCompanyName(company: string): string {
  return company.replace(LEGAL_SUFFIX_REGEX, '').replace(/\s+/g, ' ').trim();
}

function isLikelyGermanEmployer(company: string): boolean {
  return /\b(gmbh|ag|ug|kg|gruppe)\b/i.test(company);
}

function companySlug(company: string): string {
  return compactCompanyName(company).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Подсказки домена: thorconsulting → thor-consulting, thorconsulting */
function buildDomainHints(company: string): string[] {
  const slug = companySlug(company);
  if (slug.length < 6) {
    return [];
  }

  const hints = new Set<string>([slug]);

  const suffixes = ['consulting', 'software', 'digital', 'solutions', 'group', 'systems', 'tech'];
  for (const suffix of suffixes) {
    if (slug.endsWith(suffix) && slug.length > suffix.length + 3) {
      hints.add(`${slug.slice(0, -suffix.length)}-${suffix}`);
    }
  }

  return [...hints];
}

/**
 * Несколько стратегий: сначала Karriere/Impressum без title (title тянет агрегаторы вакансий).
 */
export function buildHrEmailSearchQueries(input: TavilyEmailLookupInput): HrEmailQueryStrategy[] {
  const company = input.company.trim();
  const compact = compactCompanyName(company);
  const germanEmployer = isLikelyGermanEmployer(company);

  const domainHints = [...new Set([...buildDomainHints(company), ...domainHintsFromUrl(input.jobUrl)])];

  const strategies: HrEmailQueryStrategy[] = [];

  if (domainHints.length > 0 && (germanEmployer || domainHintsFromUrl(input.jobUrl).length > 0)) {
    strategies.push({
      name: 'domain-impressum',
      query: [
        `"${company}"`,
        domainHints.join(' '),
        'impressum bewerbung karriere email kontakt',
      ].join(' '),
    });
  }

  strategies.push(
    {
      name: 'karriere-impressum',
      query: [
        `"${company}"`,
        'Karriere Impressum Bewerbung',
        'E-Mail Personalwesen HR kontakt',
      ].join(' '),
    },
    {
      name: 'bewerbung-kontakt',
      query: [
        `"${company}"`,
        'Bewerbung kontakt email',
        germanEmployer ? 'Deutschland' : null,
        'Stellenangebot Unternehmen',
      ]
        .filter((part): part is string => Boolean(part))
        .join(' '),
    },
  );

  if (compact.length >= 3 && compact.toLowerCase() !== company.toLowerCase()) {
    strategies.push({
      name: 'compact-name',
      query: `"${compact}" Karriere Impressum Bewerbung email kontakt`.trim(),
    });
  }

  // Last-resort strategy that brings in the job title. Kept last because titles tend to pull
  // job aggregators; it only runs when earlier company-focused strategies are exhausted.
  const title = input.title?.trim();
  if (title) {
    strategies.push({
      name: 'title-company',
      query: `"${company}" "${title}" Bewerbung Kontakt E-Mail Impressum`,
    });
  }

  return strategies;
}

/** @deprecated Используй buildHrEmailSearchQueries */
export function buildHrEmailSearchQuery(input: TavilyEmailLookupInput): string {
  return buildHrEmailSearchQueries(input)[0]?.query ?? input.company;
}
