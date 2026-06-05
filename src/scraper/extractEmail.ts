const EMAIL_REGEX =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const OBFUSCATED_AT_REGEX =
  /\b([A-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|@|&#64;| at )\s*([A-Z0-9.-]+)\s*(?:\[dot\]|\(dot\)|\.| dot )\s*([A-Z]{2,})\b/gi;

const HR_LOCAL_PART_HINTS = [
  'bewerbung',
  'bewerbungen',
  'hr',
  'jobs',
  'karriere',
  'recruiting',
  'personal',
  'career',
  'talent',
  'hiring',
  'stellen',
  'apply',
  'application',
  'kontakt',
  'info',
] as const;

const BLOCKED_LOCAL_PARTS = [
  'noreply',
  'no-reply',
  'no.reply',
  'donotreply',
  'do-not-reply',
  'mailer-daemon',
  'postmaster',
  'webmaster',
  'support',
  'help',
  'privacy',
  'abuse',
  'newsletter',
  'marketing',
  'sales',
  'service',
] as const;

const BLOCKED_DOMAINS = [
  'indeed.com',
  'stepstone.de',
  'stepstone.com',
  'linkedin.com',
  'glassdoor.com',
  'xing.com',
  'google.com',
  'example.com',
  'sentry.io',
  'w3.org',
  'schema.org',
] as const;

const BLOCKED_TLDS = new Set([
  'have',
  'work',
  'with',
  'that',
  'this',
  'your',
  'mail',
  'email',
  'send',
  'contact',
  'click',
  'here',
  'more',
  'info',
  'who',
]);

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase().replace(/[;,]+$/, '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  const tld = email.split('.').pop() ?? '';
  if (tld.length < 2 || tld.length > 10 || BLOCKED_TLDS.has(tld)) {
    return null;
  }

  return email;
}

function isBlockedEmail(email: string): boolean {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return true;
  }

  if (BLOCKED_LOCAL_PARTS.some((blocked) => localPart.includes(blocked))) {
    return true;
  }

  if (BLOCKED_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) {
    return true;
  }

  return false;
}

function scoreEmail(email: string): number {
  if (isBlockedEmail(email)) {
    return -100;
  }

  const [localPart, domain] = email.split('@');
  let score = 10;

  for (const hint of HR_LOCAL_PART_HINTS) {
    const pattern = new RegExp(`(^|[._-])${hint}([._-]|$)|^${hint}$`);
    if (pattern.test(localPart)) {
      score += 20;
    }
  }

  if (localPart.startsWith('bewerbung')) {
    score += 15;
  }

  if (domain.endsWith('.de')) {
    score += 3;
  }

  // Generic info@ is common on German job pages
  if (localPart === 'info' || localPart === 'kontakt') {
    score += 8;
  }

  return score;
}

export function extractEmailsFromText(text: string | null | undefined): string[] {
  if (!text?.trim()) {
    return [];
  }

  const found = new Set<string>();

  for (const match of text.matchAll(EMAIL_REGEX)) {
    const email = normalizeEmail(match[0]);
    if (email) {
      found.add(email);
    }
  }

  for (const match of text.matchAll(OBFUSCATED_AT_REGEX)) {
    const email = normalizeEmail(`${match[1]}@${match[2]}.${match[3]}`);
    if (email) {
      found.add(email);
    }
  }

  return [...found];
}

export function pickBestEmail(candidates: Iterable<string>): string | null {
  let bestEmail: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const email = normalizeEmail(candidate);
    if (!email) {
      continue;
    }

    const score = scoreEmail(email);
    if (score > bestScore) {
      bestScore = score;
      bestEmail = email;
    }
  }

  return bestScore > 0 ? bestEmail : null;
}

export function extractEmailFromTexts(...texts: Array<string | null | undefined>): string | null {
  const candidates = texts.flatMap((text) => extractEmailsFromText(text));
  return pickBestEmail(candidates);
}
