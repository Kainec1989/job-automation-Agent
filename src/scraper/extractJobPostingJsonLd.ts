export interface JobPostingStructuredData {
  description: string | null;
  title: string | null;
  company: string | null;
  emails: string[];
}

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function normalizeText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    return trimmed || null;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeText(item))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join(' ') : null;
  }

  return null;
}

function isJobPostingNode(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  if (type === 'JobPosting') {
    return true;
  }

  if (Array.isArray(type)) {
    return type.includes('JobPosting');
  }

  return false;
}

function collectJobPostingNodes(parsed: unknown, out: Record<string, unknown>[]): void {
  if (!parsed || typeof parsed !== 'object') {
    return;
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      collectJobPostingNodes(item, out);
    }
    return;
  }

  const record = parsed as Record<string, unknown>;
  if (isJobPostingNode(record)) {
    out.push(record);
  }

  if (record['@graph']) {
    collectJobPostingNodes(record['@graph'], out);
  }
}

function extractEmailsFromValue(value: unknown): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const emails: string[] = [];

    if (typeof record.email === 'string') {
      emails.push(record.email.toLowerCase());
    }

    for (const key of ['contactPoint', 'applicationContact'] as const) {
      emails.push(...extractEmailsFromValue(record[key]));
    }

    return [...new Set(emails)];
  }

  const text = normalizeText(value);
  if (!text) {
    return [];
  }

  return [...new Set((text.match(EMAIL_REGEX) ?? []).map((email) => email.toLowerCase()))];
}

function parseJobPostingNode(node: Record<string, unknown>): JobPostingStructuredData {
  const hiringOrg = node.hiringOrganization;
  let company: string | null = null;

  if (hiringOrg && typeof hiringOrg === 'object' && !Array.isArray(hiringOrg)) {
    company = normalizeText((hiringOrg as Record<string, unknown>).name);
  }

  const description = normalizeText(node.description);
  const title = normalizeText(node.title);

  const emails = [
    ...extractEmailsFromValue(node.contactPoint),
    ...extractEmailsFromValue(node.applicationContact),
    ...extractEmailsFromValue(description),
  ];

  return { description, title, company, emails };
}

/** Parse JobPosting JSON-LD blocks from raw HTML (no DOM required). */
export function extractJobPostingFromHtml(html: string): JobPostingStructuredData | null {
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const postings: Record<string, unknown>[] = [];

  for (const match of html.matchAll(scriptRegex)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }

    try {
      collectJobPostingNodes(JSON.parse(raw), postings);
    } catch {
      continue;
    }
  }

  if (postings.length === 0) {
    return null;
  }

  const best = parseJobPostingNode(postings[0]!);
  if (!best.description && !best.title && best.emails.length === 0) {
    return null;
  }

  return best;
}
