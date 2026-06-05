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
  optionalEnv('KEYWORDS_JUNIOR', 'Junior, Developer, Testautomatisierer'),
);
const keywordsPraktikum = parseKeywordList(
  optionalEnv('KEYWORDS_PRAKTIKUM', 'Praktikum, Praktikant'),
);
const searchLocation = optionalEnv('SEARCH_LOCATION', 'Leipzig');
const searchRadiusKm = Number(optionalEnv('SEARCH_RADIUS_KM', '150'));
const indeedBaseUrl = optionalEnv('INDEED_BASE_URL', 'https://de.indeed.com').replace(/\/$/, '');
const stepstoneBaseUrl = optionalEnv('STEPSTONE_BASE_URL', 'https://www.stepstone.de').replace(/\/$/, '');
const linkedinBaseUrl = optionalEnv('LINKEDIN_BASE_URL', 'https://www.linkedin.com').replace(/\/$/, '');
const linkedinDistanceMiles = Number(optionalEnv('LINKEDIN_DISTANCE_MILES', '100'));
const linkedinStorageStateRaw = process.env.LINKEDIN_STORAGE_STATE?.trim();
const indeedStorageStateRaw = process.env.INDEED_STORAGE_STATE?.trim();
const chromePath = process.env.CHROME_PATH?.trim()
  ? resolve(process.env.CHROME_PATH.trim())
  : null;
const browserHeadless = optionalEnv('BROWSER_HEADLESS', 'true') !== 'false';
const fetchFullDescription = optionalEnv('FETCH_FULL_DESCRIPTION', 'true') !== 'false';
const descriptionFetchDelayMs = Number(optionalEnv('DESCRIPTION_FETCH_DELAY_MS', '3000'));

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
  linkedinStorageState: linkedinStorageStateRaw ? resolve(linkedinStorageStateRaw) : null,
  indeedStorageState: indeedStorageStateRaw ? resolve(indeedStorageStateRaw) : null,
  browserHeadless,
  fetchFullDescription,
  descriptionFetchDelayMs,
  enabledScrapers: parseScraperList(optionalEnv('SCRAPERS', 'indeed,stepstone,linkedin')),

  indeedSearchUrls: [
    buildIndeedSearchUrl(keywordsJunior, searchLocation, searchRadiusKm, indeedBaseUrl),
    buildIndeedSearchUrl(keywordsPraktikum, searchLocation, searchRadiusKm, indeedBaseUrl),
  ],
  stepstoneSearchUrls: [
    buildStepstoneSearchUrl(keywordsJunior, searchLocation, searchRadiusKm, stepstoneBaseUrl),
    buildStepstoneSearchUrl(keywordsPraktikum, searchLocation, searchRadiusKm, stepstoneBaseUrl),
  ],
  linkedinSearchUrls: [
    buildLinkedInSearchUrl(keywordsJunior, searchLocation, linkedinDistanceMiles, linkedinBaseUrl),
    buildLinkedInSearchUrl(keywordsPraktikum, searchLocation, linkedinDistanceMiles, linkedinBaseUrl),
  ],

  testEmailTo: optionalEnv('TEST_EMAIL_TO', ''),
  testAttachmentPath: resolve(optionalEnv('TEST_ATTACHMENT_PATH', './assets/Lebenslauf.pdf')),
  dciCertificatePath: resolveOptionalAttachmentPath(
    'DCI_CERTIFICATE_PATH',
    './assets/Zertifikat_Plugin, Vladyslav_FbW WD 24-E03.pdf',
  ),
  applicantName: optionalEnv('APPLICANT_NAME', 'Ihr Name'),
  dispatchLimit: Number(optionalEnv('DISPATCH_LIMIT', '10')),
  chromePath,
  searchDelayMs: Number(optionalEnv('SEARCH_DELAY_MS', '20000')),

  googleSpreadsheetId: optionalEnv('GOOGLE_SPREADSHEET_ID', ''),
  googleCredentialsPath: resolve(optionalEnv('GOOGLE_CREDENTIALS_PATH', './google-credentials.json')),
  googleSheetName: optionalEnv('GOOGLE_SHEET_NAME', 'Sheet1'),
} as const;

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
