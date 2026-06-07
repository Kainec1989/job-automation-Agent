import type { Vacancy, VacancyType } from '../database/types.js';
import { env } from '../config/env.js';
import { sanitizeJobFields } from '../scraper/sanitizeJobFields.js';

export interface AnschreibenContent {
  subject: string;
  text: string;
}

interface TemplateContext {
  title: string;
  company: string;
  description: string | null;
  applicantName: string;
  type: VacancyType;
  contactName?: string | null;
}

const GENERIC_LOCAL_PARTS = new Set([
  'info',
  'kontakt',
  'contact',
  'bewerbung',
  'bewerbungen',
  'jobs',
  'job',
  'karriere',
  'career',
  'hr',
  'recruiting',
  'personal',
  'office',
  'mail',
  'service',
  'team',
  'hello',
  'hallo',
  'noreply',
  'no-reply',
]);

/**
 * Derives a likely contact person from a "vorname.nachname@" style address.
 * Returns null for generic mailboxes (info@, bewerbung@, ...) or non-name local parts.
 */
export function deriveContactNameFromEmail(email: string): string | null {
  const local = email.trim().toLowerCase().split('@')[0] ?? '';
  if (!local || GENERIC_LOCAL_PARTS.has(local)) {
    return null;
  }

  const parts = local.split('.').filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }

  if (parts.some((part) => part.length < 2 || !/^[a-zäöüß-]+$/.test(part))) {
    return null;
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSalutation(contactName?: string | null): string {
  if (contactName && contactName.trim()) {
    return `Guten Tag ${contactName.trim()},`;
  }

  return 'Sehr geehrte Damen und Herren,';
}

interface SkillRule {
  keywords: string[];
  bullet: string;
}

const SKILL_RULES: SkillRule[] = [
  {
    keywords: ['node', 'nestjs', 'express', 'mern'],
    bullet: 'Node.js, Express.js & NestJS — REST-APIs und serverseitige Anwendungslogik',
  },
  {
    keywords: ['typescript', ' ts ', 'ts/'],
    bullet: 'TypeScript — typsichere Entwicklung im Frontend und Backend',
  },
  {
    keywords: ['react', 'next.js', 'nextjs', 'frontend'],
    bullet: 'React & Next.js — moderne, komponentenbasierte Web-Interfaces',
  },
  {
    keywords: ['python', 'django'],
    bullet: 'Python & Django — Backend-Entwicklung und datengetriebene Services',
  },
  {
    keywords: ['mongodb', 'postgres', 'postgresql', 'mysql', 'sql', 'sqlite'],
    bullet: 'SQL & NoSQL (PostgreSQL, MongoDB, SQLite) — Datenmodellierung und Abfragen',
  },
  {
    keywords: ['playwright', 'puppeteer', 'testautomatis', 'qa', 'testing', 'selenium'],
    bullet: 'Playwright & Testautomatisierung — stabile E2E-Tests und QA-Workflows',
  },
  {
    keywords: ['docker', 'linux', 'ubuntu', 'devops', 'ci/cd', 'gitlab'],
    bullet: 'Docker & Linux (Ubuntu) — Container, Deployment und produktionsnahe Umgebungen',
  },
  {
    keywords: ['llm', 'ki', ' ai', 'openai', 'claude', 'langchain', 'rag', 'generative'],
    bullet: 'LLM-Integration & AI-Workflows — API-Anbindung, Prompt Engineering, LangChain/n8n',
  },
  {
    keywords: ['tailwind', 'css', 'html', 'web'],
    bullet: 'HTML5, CSS3 & Tailwind CSS — responsive, wartbare UI-Umsetzung',
  },
];

const DEFAULT_BULLETS = [
  'Node.js, TypeScript & React — Fullstack-Entwicklung nach MERN-Prinzip',
  'Git, REST-APIs & modulare Architektur — Clean Code in agilen Teams',
  'Playwright & automatisierte Tests — Qualitätssicherung in der Pipeline',
];

function normalizeJobText(title: string, description: string | null): string {
  return `${title} ${description ?? ''}`.toLowerCase();
}

function matchesKeyword(text: string, keyword: string): boolean {
  if (keyword.startsWith(' ') || keyword.endsWith(' ')) {
    return text.includes(keyword);
  }

  if (keyword.length <= 3) {
    return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  }

  return text.includes(keyword);
}

export function pickSkillBullets(title: string, description: string | null, max = 5): string[] {
  const text = normalizeJobText(title, description);
  const picked: string[] = [];

  for (const rule of SKILL_RULES) {
    if (rule.keywords.some((keyword) => matchesKeyword(text, keyword))) {
      picked.push(rule.bullet);
    }
    if (picked.length >= max) {
      return picked;
    }
  }

  for (const bullet of DEFAULT_BULLETS) {
    if (picked.length >= max) {
      break;
    }
    if (!picked.includes(bullet)) {
      picked.push(bullet);
    }
  }

  return picked.slice(0, max);
}

function formatBulletList(bullets: string[]): string {
  return bullets.map((bullet) => `• ${bullet}`).join('\n');
}

function shortenTitleForSubject(title: string): string {
  return sanitizeJobFields(title, '').title
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVacancyFields(
  vacancy: Pick<Vacancy, 'title' | 'company' | 'type' | 'description'>,
): Pick<Vacancy, 'title' | 'company' | 'type' | 'description'> {
  const { title, company } = sanitizeJobFields(vacancy.title, vacancy.company);
  return { ...vacancy, title, company };
}

function buildIntro(ctx: TemplateContext): string {
  if (ctx.type === 'praktikum') {
    return `die Position „${ctx.title}" bei ${ctx.company} passt zu meinem Profil als Web Developer mit Fullstack-Schwerpunkt. Ich suche ein Praxisumfeld, in dem ich Code schreibe, Tests aufbaue und von erfahrenen Entwicklern lerne.`;
  }

  return `die Rolle „${ctx.title}" bei ${ctx.company} spricht mich an, weil sie meine Fullstack-Ausrichtung und meinen Fokus auf sauberen, wartbaren Code trifft. Als Web Developer mit Schwerpunkt Node.js bringe ich praktische Projekt-Erfahrung und eine strukturierte Arbeitsweise mit.`;
}

function buildEducationParagraph(ctx: TemplateContext): string {
  const bullets = formatBulletList(pickSkillBullets(ctx.title, ctx.description));

  const certificateNote = env.dciCertificatePath
    ? ' Das offizielle DCI-Abschlusszertifikat liegt dieser Bewerbung bei.'
    : '';

  if (ctx.type === 'praktikum') {
    return `Im ${env.dciGraduation} habe ich die Weiterbildung zum Fullstack Web Developer am Digital Career Institute (DCI) abgeschlossen.${certificateNote} Die folgenden Skills setze ich gezielt in Ihrem Umfeld ein:\n\n${bullets}`;
  }

  return `Die Weiterbildung zum Fullstack Web Developer am Digital Career Institute (DCI) habe ich im ${env.dciGraduation} abgeschlossen.${certificateNote} Für Ihre Anforderungen bringe ich folgende Schwerpunkte mit:\n\n${bullets}`;
}

function buildAiParagraph(): string {
  return 'Im Alltag nutze ich AI-assisted Workflows mit Cursor IDE und LLM-APIs, um schneller zu prototypen, Code-Reviews vorzubereiten und repetitive Aufgaben zu automatisieren — ohne Qualität und Nachvollziehbarkeit aus den Augen zu verlieren.';
}

function buildClosing(ctx: TemplateContext): string {
  const availability = 'Ich bin ab sofort verfügbar und freue mich auf die Gelegenheit, mich Ihnen in einem persönlichen Gespräch vorzustellen.';
  const language =
    'Aktuell bereite ich mich auf das Zertifikat Deutsch B2 Beruf vor und kommuniziere im Team sicher auf Englisch.';

  if (ctx.type === 'praktikum') {
    return `${availability} ${language}`;
  }

  return `${availability} ${language}`;
}

function renderTemplate(ctx: TemplateContext): AnschreibenContent {
  const roleLabel = shortenTitleForSubject(ctx.title);
  const subjectSuffix =
    ctx.type === 'praktikum'
      ? `Praktikum ${roleLabel}`
      : roleLabel;

  const paragraphs = [
    buildSalutation(ctx.contactName),
    '',
    buildIntro(ctx),
    '',
    buildEducationParagraph(ctx),
    '',
    buildAiParagraph(),
    '',
    buildClosing(ctx),
    '',
    'Mit freundlichen Grüßen',
    ctx.applicantName,
  ];

  return {
    subject: `Bewerbung als ${subjectSuffix} — ${ctx.company}`,
    text: paragraphs.join('\n'),
  };
}

function shortenBulletForEmail(bullet: string): string {
  const [head] = bullet.split(' — ');
  return head ?? bullet;
}

function getEmailAttachmentList(): string {
  if (env.dciCertificatePath) {
    return 'Anschreiben, Lebenslauf und DCI-Abschlusszertifikat';
  }

  return 'Anschreiben und Lebenslauf';
}

function buildEmailHook(ctx: TemplateContext): string {
  if (ctx.type === 'praktikum') {
    return `die ausgeschriebene Position „${ctx.title}" bei ${ctx.company} entspricht genau dem, was ich suche: praktische Erfahrung in der Softwareentwicklung nach meiner DCI-Weiterbildung (${env.dciGraduation}).`;
  }

  return `die Position „${ctx.title}" bei ${ctx.company} passt zu meinem Profil als Fullstack Web Developer. Ich bringe Node.js/TypeScript-Erfahrung aus Projekten und der DCI-Weiterbildung (${env.dciGraduation}) mit.`;
}

/** Kurzer E-Mail-Text im Posteingang — Anschreiben im PDF-Anhang bleibt ausführlicher */
export function buildEmailBody(
  vacancy: Pick<Vacancy, 'title' | 'company' | 'type' | 'description'>,
  contactName?: string | null,
): string {
  const normalized = normalizeVacancyFields(vacancy);
  const templateType = selectTemplateType(normalized.type);
  const ctx: TemplateContext = {
    title: normalized.title,
    company: normalized.company,
    description: normalized.description ?? null,
    applicantName: env.applicantName,
    type: templateType,
    contactName,
  };

  const skillLines = pickSkillBullets(ctx.title, ctx.description, 3)
    .map((bullet) => `• ${shortenBulletForEmail(bullet)}`)
    .join('\n');

  const paragraphs = [
    buildSalutation(ctx.contactName),
    '',
    buildEmailHook(ctx),
    '',
    'Besonders relevant für Ihre Anforderungen:',
    skillLines,
    '',
    'Ich arbeite mit modernen AI-assisted Workflows (Cursor IDE), um effizient und qualitätsbewusst zu entwickeln.',
    '',
    `Im Anhang: ${getEmailAttachmentList()}.`,
    '',
    'Ich bin ab sofort verfügbar und freue mich auf Ihre Rückmeldung oder ein persönliches Gespräch.',
    '',
    'Mit freundlichen Grüßen',
    ctx.applicantName,
  ];

  return paragraphs.join('\n');
}

export function buildAnschreiben(
  vacancy: Pick<Vacancy, 'title' | 'company' | 'type' | 'description'>,
  contactName?: string | null,
): AnschreibenContent {
  const normalized = normalizeVacancyFields(vacancy);
  const templateType = selectTemplateType(normalized.type);

  return renderTemplate({
    title: normalized.title,
    company: normalized.company,
    description: normalized.description ?? null,
    applicantName: env.applicantName,
    type: templateType,
    contactName,
  });
}

export function selectTemplateType(type: VacancyType): VacancyType {
  if (type !== 'junior' && type !== 'praktikum') {
    throw new Error(`Invalid vacancy type for template selection: ${type}`);
  }

  return type;
}
