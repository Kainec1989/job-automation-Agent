import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getContextOptions, launchBrowser } from './browser.js';

const SITES = {
  indeed: {
    url: 'https://de.indeed.com',
    defaultPath: './data/indeed-auth.json',
    hint: 'Примите cookies / пройдите проверку, откройте любую страницу с вакансиями.',
  },
  linkedin: {
    url: 'https://www.linkedin.com/login',
    defaultPath: './data/linkedin-auth.json',
    hint: 'Войдите в аккаунт LinkedIn (если нужно).',
  },
} as const;

type SiteName = keyof typeof SITES;

async function main(): Promise<void> {
  const siteArg = (process.argv[2] ?? 'indeed').toLowerCase();
  if (!(siteArg in SITES)) {
    console.error(`Unknown site: ${siteArg}. Use: indeed | linkedin`);
    process.exit(1);
  }

  const site = siteArg as SiteName;
  const config = SITES[site];
  const outPath = resolve(process.argv[3] ?? config.defaultPath);

  mkdirSync(dirname(outPath), { recursive: true });

  const browser = await launchBrowser({ headless: false });
  const context = await browser.newContext(getContextOptions());
  const page = await context.newPage();

  console.log(`\nОткрываю ${config.url}`);
  console.log(config.hint);
  await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  const rl = readline.createInterface({ input, output });
  await rl.question('\nКогда страница загружена нормально — нажмите Enter для сохранения сессии... ');
  rl.close();

  await context.storageState({ path: outPath });
  await browser.close();

  const envKey = site === 'indeed' ? 'INDEED_STORAGE_STATE' : 'LINKEDIN_STORAGE_STATE';
  console.log(`\nСессия сохранена: ${outPath}`);
  console.log(`Добавьте в .env:\n${envKey}=${outPath}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
