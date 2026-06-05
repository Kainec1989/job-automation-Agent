import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../config/env.js';

const AUTH_SITES = {
  linkedin: {
    label: 'LinkedIn',
    path: () => env.linkedinStorageState,
    defaultPath: './data/linkedin-auth.json',
    envKey: 'LINKEDIN_STORAGE_STATE',
    authCommand: 'npm run auth:linkedin',
  },
  indeed: {
    label: 'Indeed',
    path: () => env.indeedStorageState,
    defaultPath: './data/indeed-auth.json',
    envKey: 'INDEED_STORAGE_STATE',
    authCommand: 'npm run auth:indeed',
  },
} as const;

type AuthScraper = keyof typeof AUTH_SITES;

export interface AuthSessionInfo {
  scraper: AuthScraper;
  label: string;
  path: string;
  exists: boolean;
  cookieCount: number | null;
  enabled: boolean;
}

function countCookies(filePath: string): number | null {
  try {
    const state = JSON.parse(readFileSync(filePath, 'utf8')) as { cookies?: unknown[] };
    return Array.isArray(state.cookies) ? state.cookies.length : null;
  } catch {
    return null;
  }
}

export function getAuthSessionInfos(): AuthSessionInfo[] {
  return (Object.keys(AUTH_SITES) as AuthScraper[]).map((scraper) => {
    const site = AUTH_SITES[scraper];
    const configuredPath = site.path();
    const path = configuredPath ?? resolve(site.defaultPath);
    const exists = existsSync(path);

    return {
      scraper,
      label: site.label,
      path,
      exists,
      cookieCount: exists ? countCookies(path) : null,
      enabled: env.enabledScrapers.includes(scraper),
    };
  });
}

export function printAuthSessionStatus(): void {
  const sessions = getAuthSessionInfos();

  console.log('=== Browser auth sessions ===');
  for (const session of sessions) {
    const status = session.exists
      ? `OK (${session.cookieCount ?? '?'} cookies)`
      : 'missing';
    const enabled = session.enabled ? 'enabled' : 'disabled';
    console.log(`  [${session.label}] ${status} — ${session.path} (${enabled})`);
  }
}

export function printScraperAuthWarnings(): void {
  const warnings: string[] = [];

  for (const session of getAuthSessionInfos()) {
    if (!session.enabled) {
      continue;
    }

    const site = AUTH_SITES[session.scraper];
    if (!session.exists) {
      warnings.push(
        `[${session.label}] No saved session at ${session.path}. Run: ${site.authCommand}`,
      );
      continue;
    }

    if (session.cookieCount === 0) {
      warnings.push(
        `[${session.label}] Session file has no cookies. Re-run: ${site.authCommand}`,
      );
    }
  }

  if (warnings.length === 0) {
    return;
  }

  console.warn('\n=== Scraper auth warnings ===');
  for (const warning of warnings) {
    console.warn(`  ⚠ ${warning}`);
  }
  console.warn('');
}

export function validateStorageStateFile(filePath: string): { ok: boolean; cookieCount: number } {
  if (!existsSync(filePath)) {
    throw new Error(`Session file not found: ${filePath}`);
  }

  const cookieCount = countCookies(filePath);
  if (cookieCount === null) {
    throw new Error(`Invalid session file (expected JSON with cookies[]): ${filePath}`);
  }

  return { ok: true, cookieCount };
}

async function main(): Promise<void> {
  printAuthSessionStatus();
  printScraperAuthWarnings();
}

if (process.argv[1]?.endsWith('authStatus.ts')) {
  void main();
}
