const LEGAL_SUFFIX_REGEX =
  /\b(gmbh|ag|ug|kg|ohg|se|inc|ltd|llc|group|gruppe|co\.?)\b/gi;

export function companySlug(company: string): string {
  return company
    .toLowerCase()
    .replace(LEGAL_SUFFIX_REGEX, '')
    .replace(/[^a-z0-9]/g, '');
}

function companyKeywords(company: string): string[] {
  return company
    .toLowerCase()
    .replace(LEGAL_SUFFIX_REGEX, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5);
}

/** Домен должен содержать существенную часть названия (не короткий «thor»). */
export function emailMatchesCompanyDomain(email: string, company: string): boolean {
  const domainRoot = (email.split('@')[1] ?? '')
    .toLowerCase()
    .replace(/\.(de|com|net|org|eu|group|io|co|uk)$/, '')
    .replace(/[^a-z0-9]/g, '');

  const slug = companySlug(company);
  if (slug.length >= 8 && domainRoot.includes(slug.slice(0, 8))) {
    return true;
  }

  if (slug.length >= 6 && (domainRoot.includes(slug) || slug.includes(domainRoot))) {
    return true;
  }

  const keywords = companyKeywords(company);
  if (keywords.length > 0) {
    return keywords.some((word) => domainRoot.includes(word));
  }

  return slug.length >= 6 && domainRoot.includes(slug);
}
