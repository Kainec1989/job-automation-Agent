import type { VacancyType } from '../database/types.js';

// Группа 1: основной стек — обязательно хотя бы одно совпадение
const CORE_TECH = [
  'node',
  'typescript',
  'javascript',
  'js',
  'ts',
  'react',
  'next.js',
  'nextjs',
  'testautomatisierer',
  'testautomatisierung',
  'playwright',
  'puppeteer',
  'python',
  'django',
  'tailwind',
  'mongodb',
  // Роли и общие IT-термины (часто только в заголовке, без стека в сниппете)
  'developer',
  'engineer',
  'software',
  'entwickler',
  'softwareentwickler',
  'softwareentwicklung',
  'softwareingenieur',
  'programmierer',
  'llm',
  'llms',
  'ki',
  'webentwickler',
  'fullstack',
  'full-stack',
  'full stack',
  'informatik',
  'informatiker',
  'devops',
  'jest',
  'cypress',
  'selenium',
  'vitest',
  'mern',
  'qa',
] as const;

// Группа 2: инфраструктура, БД, ИИ — не проходит сама по себе, только вместе с CORE
const SUB_TECH = [
  'express',
  'nestjs',
  'backend',
  'frontend',
  'html',
  'css',
  'prisma',
  'typeorm',
  'sequelize',
  'postgres',
  'postgresql',
  'sqlite',
  'mysql',
  'sql',
  'linux',
  'ubuntu',
  'docker',
  'git',
  'github',
  'gitlab',
  'rest',
  'api',
  'automation',
  'qa',
  'testing',
  'bot',
  'telegram',
  'ai',
  'ki',
  'llm',
  'openai',
  'gpt',
  'ollama',
  'prompt',
  'cursor',
  'copilot',
  'langchain',
  'langgraph',
  'llamaindex',
  'autogen',
  'crewai',
  'flowise',
  'n8n',
  'anthropic',
  'claude',
  'gemini',
  'deepseek',
  'mistral',
  'llama3',
  'llama',
  'huggingface',
  'rag',
  'vector',
  'embeddings',
  'semantic',
  'function calling',
  'tool use',
] as const;

const TITLE_BLACKLIST_REGEXES = [
  // Опыт / уровень
  /\bsenior\b/i,
  /\blead\b/i,
  /\bprincipal\b/i,
  /\barchitect\b/i,
  /\bteamleiter\b/i,
  /\bhead of\b/i,
  /\bjahre berufserfahrung\b/i,
  // Чужой стек
  /\bjava\b/i,
  /\bc#\b/i,
  /\b\.net\b/i,
  /\bphp\b/i,
  /\bc\+\+/i,
  /\bangular\b/i,
  // Чужие домены / роли
  /\bembedded\b/i,
  /\bfirmware\b/i,
  /\bgame designer\b/i,
  /\betl\b/i,
  /\bbusiness analyst\b/i,
] as const;

const EXPERIENCE_BLACKLIST_REGEXES = [
  /\bsenior\b/i,
  /\blead\b/i,
  /\bteamleiter\b/i,
] as const;

// Не-IT: всегда в title; в description — только если title сам по себе не IT
const NON_IT_BLACKLIST_REGEXES = [
  /\bmechaniker\b/i,
  /\bmechatroniker\b/i,
  /\bautomotive\b/i,
  /\bfahrer\b/i,
  /\bberater\b/i,
  /\bconsulting\b/i,
  /\bmanager\b/i,
  /\bsport\b/i,
  /\bspieler\b/i,
  /\bmarketing\b/i,
  /\bsales\b/i,
  /\bvertrieb\b/i,
  /\bbetriebswirtschaft/i,
  /\bunternehmensberatung/i,
] as const;

export type ClassificationStatsKey =
  | 'accepted_junior'
  | 'accepted_praktikum'
  | 'title_blacklist'
  | 'experience_blacklist'
  | 'non_it_blacklist'
  | 'sub_tech_only'
  | 'no_tech'
  | 'praktikum_no_it';

export interface ClassificationResult {
  type: VacancyType;
  isFit: boolean;
  reason?: string;
  statsKey: ClassificationStatsKey;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Короткие токены (ts, js, ai) — только целые слова, иначе ложные совпадения в «arbeitsplatz», «e-mail» */
function matchesTechTerm(tech: string, text: string): boolean {
  const normalized = tech.toLowerCase();

  if (normalized.length <= 3) {
    return new RegExp(`\\b${escapeRegex(normalized)}\\b`, 'i').test(text);
  }

  return text.includes(normalized);
}

function hasCoreTech(text: string): boolean {
  return CORE_TECH.some((tech) => matchesTechTerm(tech, text));
}

function hasSubTech(text: string): boolean {
  return SUB_TECH.some((tech) => matchesTechTerm(tech, text));
}

function findTitleBlacklistMatch(title: string): string | null {
  for (const regex of TITLE_BLACKLIST_REGEXES) {
    if (regex.test(title)) {
      return regex.source;
    }
  }

  return null;
}

function findRegexMatch(text: string, regexes: readonly RegExp[]): string | null {
  for (const regex of regexes) {
    if (regex.test(text)) {
      return regex.source;
    }
  }

  return null;
}

function isJuniorTitle(title: string): boolean {
  return (
    /\bjunior\b/i.test(title) ||
    /\bpraktikum\b/i.test(title) ||
    /\bpraktikant\b/i.test(title) ||
    /\bintern\b/i.test(title) ||
    /\bentry[\s-]?level\b/i.test(title) ||
    /\bberufseinsteiger\b/i.test(title) ||
    /\btrainee\b/i.test(title)
  );
}

function findExperienceBlacklistMatch(title: string, combinedText: string): string | null {
  const titleMatch = findRegexMatch(title, EXPERIENCE_BLACKLIST_REGEXES);
  if (titleMatch) {
    return titleMatch;
  }

  // «grow into senior roles» в описании Junior-вакансии — не отсеиваем
  if (isJuniorTitle(title)) {
    return null;
  }

  return findRegexMatch(combinedText, EXPERIENCE_BLACKLIST_REGEXES);
}

/** Praktikum/intern — только по заголовку; слово в описании (z. B. CHECK24) не меняет тип */
function isPraktikumTitle(title: string): boolean {
  return (
    /\bpraktikum\b/i.test(title) ||
    /\bpraktikant/i.test(title) ||
    /\bintern\b/i.test(title)
  );
}

/** Praktikum проходит только если в заголовке есть IT-сигнал (не только в описании) */
function hasItSignalInTitle(title: string): boolean {
  if (hasCoreTech(title)) {
    return true;
  }

  return /\binformatik/i.test(title) || /\bdigital/i.test(title);
}

function findNonItBlacklistMatch(title: string, combinedText: string): string | null {
  const titleMatch = findRegexMatch(title, NON_IT_BLACKLIST_REGEXES);
  if (titleMatch) {
    return titleMatch;
  }

  if (hasCoreTech(title)) {
    return null;
  }

  return findRegexMatch(combinedText, NON_IT_BLACKLIST_REGEXES);
}

export function classifyVacancy(title: string, description?: string | null): ClassificationResult {
  const cleanTitle = title.toLowerCase();
  const cleanDescription = (description ?? '').toLowerCase();
  const combinedText = `${cleanTitle} ${cleanDescription}`;

  const titleBlacklist = findTitleBlacklistMatch(cleanTitle);
  if (titleBlacklist) {
    return {
      type: 'junior',
      isFit: false,
      reason: `Title matches blacklist pattern: ${titleBlacklist}`,
      statsKey: 'title_blacklist',
    };
  }

  const experienceBlacklist = findExperienceBlacklistMatch(cleanTitle, combinedText);
  if (experienceBlacklist) {
    return {
      type: 'junior',
      isFit: false,
      reason: `Matches experience blacklist: ${experienceBlacklist}`,
      statsKey: 'experience_blacklist',
    };
  }

  const nonItBlacklist = findNonItBlacklistMatch(cleanTitle, combinedText);
  if (nonItBlacklist) {
    return {
      type: 'junior',
      isFit: false,
      reason: `Matches non-IT blacklist: ${nonItBlacklist}`,
      statsKey: 'non_it_blacklist',
    };
  }

  const coreMatch = hasCoreTech(combinedText);
  const subMatch = hasSubTech(combinedText);

  if (!coreMatch && subMatch) {
    return {
      type: 'junior',
      isFit: false,
      reason: 'Rejected: has sub-tech only, core required',
      statsKey: 'sub_tech_only',
    };
  }

  if (!coreMatch && !subMatch) {
    return {
      type: 'junior',
      isFit: false,
      reason: 'Rejected: No matching technologies found at all',
      statsKey: 'no_tech',
    };
  }

  if (isPraktikumTitle(cleanTitle)) {
    if (!hasItSignalInTitle(cleanTitle)) {
      return {
        type: 'praktikum',
        isFit: false,
        reason: 'Rejected: praktikum without IT signal in title',
        statsKey: 'praktikum_no_it',
      };
    }

    return { type: 'praktikum', isFit: true, statsKey: 'accepted_praktikum' };
  }

  return { type: 'junior', isFit: true, statsKey: 'accepted_junior' };
}

/** @deprecated Используй classifyVacancy — возвращает только type без фильтрации */
export function classifyVacancyType(title: string, description?: string | null): VacancyType {
  return classifyVacancy(title, description).type;
}
