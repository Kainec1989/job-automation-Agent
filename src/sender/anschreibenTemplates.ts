import type { Vacancy, VacancyType } from '../database/types.js';
import { env } from '../config/env.js';

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
  return title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
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
    return `Im Mai 2025 habe ich die Weiterbildung zum Fullstack Web Developer am Digital Career Institute (DCI) abgeschlossen.${certificateNote} Die folgenden Skills setze ich gezielt in Ihrem Umfeld ein:\n\n${bullets}`;
  }

  return `Die Weiterbildung zum Fullstack Web Developer am Digital Career Institute (DCI) habe ich im Mai 2025 abgeschlossen.${certificateNote} Für Ihre Anforderungen bringe ich folgende Schwerpunkte mit:\n\n${bullets}`;
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
    'Sehr geehrte Damen und Herren,',
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
    subject: `Bewerbung als ${subjectSuffix} — ${ctx.applicantName}`,
    text: paragraphs.join('\n'),
  };
}

export function buildAnschreiben(
  vacancy: Pick<Vacancy, 'title' | 'company' | 'type' | 'description'>,
): AnschreibenContent {
  const templateType = selectTemplateType(vacancy.type);

  return renderTemplate({
    title: vacancy.title,
    company: vacancy.company,
    description: vacancy.description ?? null,
    applicantName: env.applicantName,
    type: templateType,
  });
}

export function selectTemplateType(type: VacancyType): VacancyType {
  if (type !== 'junior' && type !== 'praktikum') {
    throw new Error(`Invalid vacancy type for template selection: ${type}`);
  }

  return type;
}
