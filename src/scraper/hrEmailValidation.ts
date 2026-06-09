import { emailMatchesCompanyDomain } from '../enrichment/tavily/companyMatch.js';
import { extractEmailsFromText, pickBestEmail } from './extractEmail.js';

const SUSPICIOUS_LOCAL_PARTS = [
  'yourself',
  'yourname',
  'your.email',
  'example',
  'username',
  'name',
  'firstname',
  'lastname',
  'test',
  'sample',
  'placeholder',
  'email',
  'user',
  'schwerbehindertenvertretung',
  'behindertenvertretung',
  'schwerbehinderung',
] as const;

/** Generic mailboxes — never use for automated applications, even on a matching domain. */
const GENERIC_LOCAL_PARTS = new Set([
  'info',
  'kontakt',
  'contact',
  'hello',
  'mail',
  'office',
  'service',
  'support',
  'vertrieb',
  'impressum',
]);

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Отсекает yourself@, placeholder и email без связи с компанией. */
export function isPlausibleHrEmail(email: string, company?: string | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }

  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) {
    return false;
  }

  if (SUSPICIOUS_LOCAL_PARTS.some((part) => localPart === part || localPart.includes(part))) {
    return false;
  }

  if (GENERIC_LOCAL_PARTS.has(localPart) || localPart.startsWith('info.')) {
    return false;
  }

  if (!company?.trim()) {
    return true;
  }

  if (emailMatchesCompanyDomain(normalized, company)) {
    return true;
  }

  const hasHrHint = /bewerbung|karriere|jobs|hr|recruiting|personal|career|talent|hiring|stellen/.test(
    localPart,
  );

  if (hasHrHint && domain.endsWith('.de')) {
    return true;
  }

  return false;
}

export function pickBestHrEmail(
  candidates: Iterable<string>,
  company?: string | null,
): string | null {
  const list = [...candidates];
  const plausible = company
    ? list.filter((email) => isPlausibleHrEmail(email, company))
    : list.filter((email) => isPlausibleHrEmail(email));

  if (plausible.length === 0) {
    return null;
  }

  if (company) {
    const domainMatches = plausible.filter((email) => emailMatchesCompanyDomain(email, company));
    if (domainMatches.length > 0) {
      return pickBestEmail(domainMatches);
    }
  }

  return pickBestEmail(plausible);
}

export function extractHrEmailFromTexts(
  company: string | null | undefined,
  ...texts: Array<string | null | undefined>
): string | null {
  const candidates = texts.flatMap((text) => extractEmailsFromText(text));
  return pickBestHrEmail(candidates, company);
}
