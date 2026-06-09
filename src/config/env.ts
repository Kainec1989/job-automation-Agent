import { existsSync } from 'node:fs';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config();

function optionalEnv(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

/** Пустая строка в .env = явно отключить вложение */
function resolveOptionalAttachmentPath(key: string, defaultRelative: string): string | null {
  if (key in process.env && !process.env[key]?.trim()) {
    return null;
  }

  const resolved = resolve(process.env[key]?.trim() || defaultRelative);
  return existsSync(resolved) ? resolved : null;
}

function parseKeywordList(value: string): string[] {
  return value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function parseScraperList(value: string): string[] {
  return value
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

function buildIndeedSearchUrl(
  keywords: string[],
  location: string,
  radiusKm: number,
  baseUrl: string,
): string {
  const query = encodeURIComponent(keywords.join(' '));
  const loc = encodeURIComponent(location);
  const radius = encodeURIComponent(String(radiusKm));
  return `${baseUrl}/jobs?q=${query}&l=${loc}&radius=${radius}`;
}

function buildStepstoneSearchUrl(keywords: string[], location: string, radiusKm: number, baseUrl: string): string {
  const query = encodeURIComponent(keywords.join(' '));
  const loc = encodeURIComponent(location);
  const radius = encodeURIComponent(String(radiusKm));
  return `${baseUrl}/jobs?ke=${query}&li=${loc}&r=${radius}`;
}

function buildLinkedInSearchUrl(
  keywords: string[],
  location: string,
  distanceMiles: number,
  baseUrl: string,
): string {
  const query = encodeURIComponent(keywords.join(' '));
  const loc = encodeURIComponent(`${location}, Deutschland`);
  const distance = encodeURIComponent(String(distanceMiles));
  return `${baseUrl}/jobs/search/?keywords=${query}&location=${loc}&distance=${distance}`;
}

const keywordsJunior = parseKeywordList(
  optionalEnv('KEYWORDS_JUNIOR', 'Junior Developer, Testautomatisierung, QA Engineer'),
);
const keywordsPraktikum = parseKeywordList(
  optionalEnv('KEYWORDS_PRAKTIKUM', 'Praktikum Softwareentwicklung'),
);
const searchLocation = optionalEnv('SEARCH_LOCATION', 'Leipzig');
const searchRadiusKm = Number(optionalEnv('SEARCH_RADIUS_KM', '150'));
const indeedBaseUrl = optionalEnv('INDEED_BASE_URL', 'https://de.indeed.com').replace(/\/$/, '');
const stepstoneBaseUrl = optionalEnv('STEPSTONE_BASE_URL', 'https://www.stepstone.de').replace(/\/$/, '');
const linkedinBaseUrl = optionalEnv('LINKEDIN_BASE_URL', 'https://www.linkedin.com').replace(/\/$/, '');
const linkedinDistanceMiles = Number(optionalEnv('LINKEDIN_DISTANCE_MILES', '100'));
function resolveStorageState(envKey: string, defaultRelative: string): string | null {
  const configured = process.env[envKey]?.trim();
  const resolvedPath = resolve(configured || defaultRelative);

  if (existsSync(resolvedPath)) {
    return resolvedPath;
  }

  return configured ? resolvedPath : null;
}

const linkedinStorageState = resolveStorageState(
  'LINKEDIN_STORAGE_STATE',
  './data/linkedin-auth.json',
);
const indeedStorageState = resolveStorageState('INDEED_STORAGE_STATE', './data/indeed-auth.json');
const chromePath = process.env.CHROME_PATH?.trim()
  ? resolve(process.env.CHROME_PATH.trim())
  : null;
const browserHeadless = optionalEnv('BROWSER_HEADLESS', 'true') !== 'false';
const fetchFullDescription = optionalEnv('FETCH_FULL_DESCRIPTION', 'true') !== 'false';
const descriptionFetchDelayMs = Number(optionalEnv('DESCRIPTION_FETCH_DELAY_MS', '3000'));
const descriptionFetchConcurrency = Number(optionalEnv('DESCRIPTION_FETCH_CONCURRENCY', '4'));
const extractEmail = optionalEnv('EXTRACT_EMAIL', 'true') !== 'false';
const scrapeMaxPages = Number(optionalEnv('SCRAPE_MAX_PAGES', '3'));
const scrapePageDelayMs = Number(optionalEnv('SCRAPE_PAGE_DELAY_MS', '5000'));
const scrapeMaxRetries = Number(optionalEnv('SCRAPE_MAX_RETRIES', '2'));
const tavilyLookupDelayMs = Number(optionalEnv('TAVILY_LOOKUP_DELAY_MS', '1500'));
const tavilyMaxQueriesPerLookup = Number(optionalEnv('TAVILY_MAX_QUERIES_PER_LOOKUP', '2'));
const tavilyExtractEnabled = optionalEnv('TAVILY_EXTRACT_ENABLED', 'true') !== 'false';
const tavilyMaxExtractUrls = Number(optionalEnv('TAVILY_MAX_EXTRACT_URLS', '3'));
const tavilyNegativeCacheTtlDays = Number(optionalEnv('TAVILY_NEGATIVE_CACHE_TTL_DAYS', '14'));
const tavilyMaxRetries = Number(optionalEnv('TAVILY_MAX_RETRIES', '2'));
const llmMaxRetries = Number(optionalEnv('LLM_MAX_RETRIES', '3'));
const llmRetryDelayMs = Number(optionalEnv('LLM_RETRY_DELAY_MS', '3000'));
export const env = {
  databasePath: resolve(optionalEnv('DATABASE_PATH', './data/vacancies.db')),

  keywordsJunior,
  keywordsPraktikum,
  searchLocation,
  searchRadiusKm,
  indeedBaseUrl,
  stepstoneBaseUrl,
  linkedinBaseUrl,
  linkedinDistanceMiles,
  linkedinStorageState,
  indeedStorageState,
  browserHeadless,
  fetchFullDescription,
  descriptionFetchDelayMs,
  descriptionFetchConcurrency,
  extractEmail,
  scrapeMaxPages,
  scrapePageDelayMs,
  scrapeMaxRetries,
  enabledScrapers: parseScraperList(optionalEnv('SCRAPERS', 'stepstone,linkedin')),

  // Search each keyword entry separately. Joining them produced a single
  // "must match all words" query (e.g. ke=Junior+Developer+Testautomatisierer),
  // which returns almost nothing on Stepstone.
  indeedSearchUrls: [...keywordsJunior, ...keywordsPraktikum].map((keyword) =>
    buildIndeedSearchUrl([keyword], searchLocation, searchRadiusKm, indeedBaseUrl),
  ),
  stepstoneSearchUrls: [...keywordsJunior, ...keywordsPraktikum].map((keyword) =>
    buildStepstoneSearchUrl([keyword], searchLocation, searchRadiusKm, stepstoneBaseUrl),
  ),
  linkedinSearchUrls: [...keywordsJunior, ...keywordsPraktikum].map((keyword) =>
    buildLinkedInSearchUrl([keyword], searchLocation, linkedinDistanceMiles, linkedinBaseUrl),
  ),

  testEmailTo: optionalEnv('TEST_EMAIL_TO', ''),
  testAttachmentPath: resolve(optionalEnv('TEST_ATTACHMENT_PATH', './assets/Lebenslauf.pdf')),
  // Production CV used for real applications. Falls back to TEST_ATTACHMENT_PATH for backward compatibility.
  resumePath: resolve(
    optionalEnv('RESUME_PATH', optionalEnv('TEST_ATTACHMENT_PATH', './assets/Lebenslauf.pdf')),
  ),
  dciCertificatePath: resolveOptionalAttachmentPath(
    'DCI_CERTIFICATE_PATH',
    './assets/Zertifikat_Plugin, Vladyslav_FbW WD 24-E03.pdf',
  ),
  applicantName: optionalEnv('APPLICANT_NAME', 'Ihr Name'),
  applicantEmail: optionalEnv('APPLICANT_EMAIL', ''),
  applicantPhone: optionalEnv('APPLICANT_PHONE', ''),
  applicantLocation: optionalEnv('APPLICANT_LOCATION', ''),
  dciGraduation: optionalEnv('DCI_GRADUATION', 'Mai 2025'),
  dispatchLimit: Number(optionalEnv('DISPATCH_LIMIT', '15')),
  dispatchMaxRetries: Number(optionalEnv('DISPATCH_MAX_RETRIES', '3')),
  dispatchRequireApproval: optionalEnv('DISPATCH_REQUIRE_APPROVAL', 'false') === 'true',
  dispatchApprovalTimeoutMs: Number(optionalEnv('DISPATCH_APPROVAL_TIMEOUT_MS', '600000')),
  dispatchMaxPerDomainPerDay: Number(optionalEnv('DISPATCH_MAX_PER_DOMAIN_PER_DAY', '1')),
  doNotContact: parseKeywordList(optionalEnv('DO_NOT_CONTACT', '')).map((entry) =>
    entry.toLowerCase(),
  ),
  pipelineNotifyEnabled: optionalEnv('PIPELINE_NOTIFY_ENABLED', 'false') === 'true',
  pipelineNotifyEmail: optionalEnv('PIPELINE_NOTIFY_EMAIL', 'true') !== 'false',
  notifyEmailTo: optionalEnv('NOTIFY_EMAIL_TO', ''),
  telegramBotToken: optionalEnv('TELEGRAM_BOT_TOKEN', ''),
  telegramChatId: optionalEnv('TELEGRAM_CHAT_ID', ''),
  chromePath,
  searchDelayMs: Number(optionalEnv('SEARCH_DELAY_MS', '20000')),

  googleSpreadsheetId: optionalEnv('GOOGLE_SPREADSHEET_ID', ''),
  googleCredentialsPath: resolve(optionalEnv('GOOGLE_CREDENTIALS_PATH', './google-credentials.json')),
  googleSheetName: optionalEnv('GOOGLE_SHEET_NAME', 'Sheet1'),

  tavilyLookupDelayMs,
  tavilyMaxQueriesPerLookup,
  tavilyExtractEnabled,
  tavilyMaxExtractUrls,
  tavilyNegativeCacheTtlDays,
  tavilyMaxRetries,
  llmMaxRetries,
  llmRetryDelayMs,
} as const;

export interface TavilyConfig {
  apiKey: string;
  enabled: boolean;
  searchDepth: 'basic' | 'advanced' | 'fast' | 'ultra-fast';
  extractDepth: 'basic' | 'advanced';
  maxResults: number;
  maxLookups: number;
  extractEnabled: boolean;
  maxExtractUrls: number;
}

export function isTavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

export function getTavilyConfig(): TavilyConfig {
  const apiKey = process.env.TAVILY_API_KEY?.trim() ?? '';

  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not set in .env');
  }

  const depth = optionalEnv('TAVILY_SEARCH_DEPTH', 'basic');
  const allowedDepths = new Set(['basic', 'advanced', 'fast', 'ultra-fast']);
  const searchDepth = allowedDepths.has(depth)
    ? (depth as TavilyConfig['searchDepth'])
    : 'basic';

  const extractDepthRaw = optionalEnv('TAVILY_EXTRACT_DEPTH', 'basic');
  const extractDepth = extractDepthRaw === 'advanced' ? 'advanced' : 'basic';

  return {
    apiKey,
    enabled: optionalEnv('TAVILY_ENABLED', 'false') === 'true',
    searchDepth,
    extractDepth,
    maxResults: Number(optionalEnv('TAVILY_MAX_RESULTS', '5')),
    maxLookups: Number(optionalEnv('TAVILY_MAX_LOOKUPS', '25')),
    extractEnabled: optionalEnv('TAVILY_EXTRACT_ENABLED', 'true') !== 'false',
    maxExtractUrls: Number(optionalEnv('TAVILY_MAX_EXTRACT_URLS', '3')),
  };
}

export type LlmProvider = 'openai' | 'anthropic' | 'gemini';

export interface LlmConfig {
  enabled: boolean;
  provider: LlmProvider;
  apiKey: string;
  model: string;
  /** Optional override for OpenAI-compatible providers (e.g. Groq, OpenRouter). */
  baseUrl: string;
  maxRetries: number;
  retryDelayMs: number;
}

export interface LlmAttemptConfig {
  label: string;
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxRetries: number;
  retryDelayMs: number;
}

function parseLlmProvider(value: string): LlmProvider {
  if (value === 'anthropic' || value === 'gemini') {
    return value;
  }
  return 'openai';
}

function defaultModelForProvider(provider: LlmProvider): string {
  switch (provider) {
    case 'gemini':
      return 'gemini-2.5-flash';
    case 'anthropic':
      return 'claude-3-5-haiku-latest';
    default:
      return 'gpt-4o-mini';
  }
}

export function isLlmConfigured(): boolean {
  return optionalEnv('LLM_ENABLED', 'false') === 'true' && Boolean(process.env.LLM_API_KEY?.trim());
}

export function getLlmConfig(): LlmConfig {
  const provider = parseLlmProvider(optionalEnv('LLM_PROVIDER', 'gemini'));

  return {
    enabled: optionalEnv('LLM_ENABLED', 'false') === 'true',
    provider,
    apiKey: process.env.LLM_API_KEY?.trim() ?? '',
    model: optionalEnv('LLM_MODEL', defaultModelForProvider(provider)),
    baseUrl: optionalEnv('LLM_BASE_URL', ''),
    maxRetries: llmMaxRetries,
    retryDelayMs: llmRetryDelayMs,
  };
}

const GEMINI_FALLBACK_MODEL = 'gemini-2.0-flash';

function toAttemptConfig(config: LlmConfig, label: string): LlmAttemptConfig {
  return {
    label,
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
  };
}

type FallbackEnvPrefix = 'LLM_FALLBACK' | 'LLM_FALLBACK2';

function appendOpenAiCompatibleFallback(
  chain: LlmAttemptConfig[],
  primary: LlmConfig,
  prefix: FallbackEnvPrefix,
): void {
  const providerRaw = optionalEnv(`${prefix}_PROVIDER`, '');
  if (!providerRaw) {
    return;
  }

  const provider = parseLlmProvider(providerRaw);
  const apiKey =
    process.env[`${prefix}_API_KEY`]?.trim() ||
    (provider === primary.provider ? primary.apiKey : '');

  if (!apiKey) {
    return;
  }

  const model = optionalEnv(`${prefix}_MODEL`, defaultModelForProvider(provider));
  const baseUrl = optionalEnv(
    `${prefix}_BASE_URL`,
    provider === 'openai' ? primary.baseUrl : '',
  );

  chain.push(
    toAttemptConfig(
      {
        ...primary,
        provider,
        apiKey,
        model,
        baseUrl,
      },
      `${provider}/${model}`,
    ),
  );
}

/** Ordered LLM attempts: primary → Gemini fallback model → optional external fallbacks. */
export function getLlmAttemptChain(): LlmAttemptConfig[] {
  const primary = getLlmConfig();
  if (!primary.enabled || !primary.apiKey) {
    return [];
  }

  const chain: LlmAttemptConfig[] = [
    toAttemptConfig(primary, `${primary.provider}/${primary.model}`),
  ];

  if (primary.provider === 'gemini' && primary.model !== GEMINI_FALLBACK_MODEL) {
    chain.push(
      toAttemptConfig(
        { ...primary, model: GEMINI_FALLBACK_MODEL },
        `${primary.provider}/${GEMINI_FALLBACK_MODEL}`,
      ),
    );
  }

  appendOpenAiCompatibleFallback(chain, primary, 'LLM_FALLBACK');
  appendOpenAiCompatibleFallback(chain, primary, 'LLM_FALLBACK2');

  return chain;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export function getSmtpConfig(): SmtpConfig {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const;
  const missing = required.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required SMTP environment variables: ${missing.join(', ')}`);
  }

  const user = process.env.SMTP_USER!.trim();

  return {
    host: process.env.SMTP_HOST!.trim(),
    port: Number(optionalEnv('SMTP_PORT', '587')),
    secure: optionalEnv('SMTP_SECURE', 'false') === 'true',
    user,
    pass: process.env.SMTP_PASS!.trim(),
    from: optionalEnv('SMTP_FROM', user),
  };
}
