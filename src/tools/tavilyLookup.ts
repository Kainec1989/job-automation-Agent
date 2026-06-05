import { closeDatabase } from '../database/db.js';
import { VacancyRepository } from '../database/vacancyRepository.js';
import { enrichVacanciesWithTavily } from '../enrichment/tavily/enrichDatabase.js';
import { lookupHrEmail } from '../enrichment/tavily/emailLookup.js';
import { TavilyApiError } from '../enrichment/tavily/client.js';
import type { TavilyEmailLookupResult } from '../enrichment/tavily/types.js';
import { getTavilyConfig } from '../config/env.js';

function parseArgs(argv: string[]): {
  company?: string;
  title?: string;
  limit: number;
  dryRun: boolean;
  noSync: boolean;
} {
  let company: string | undefined;
  let title: string | undefined;
  let limit = getTavilyConfig().maxLookups;
  let dryRun = false;
  let noSync = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--company' && argv[i + 1]) {
      company = argv[++i];
      continue;
    }
    if (arg === '--title' && argv[i + 1]) {
      title = argv[++i];
      continue;
    }
    if (arg === '--limit' && argv[i + 1]) {
      limit = Number(argv[++i]);
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
    }
    if (arg === '--no-sync') {
      noSync = true;
    }
  }

  return { company, title, limit, dryRun, noSync };
}

function printLookupResult(label: string, result: TavilyEmailLookupResult, saved = false): void {
  console.log(`\n=== ${label} ===`);
  console.log(`Strategy: ${result.strategy}`);
  console.log(`Query: ${result.query}`);
  if (result.queriesAttempted.length > 1) {
    console.log(`Queries tried: ${result.queriesAttempted.length}`);
  }
  if (result.extractedUrls.length > 0) {
    console.log(`Extract URLs: ${result.extractedUrls.join(', ')}`);
  }
  console.log(`Email: ${result.email ?? '(not found)'}`);
  if (result.sourceUrl) {
    console.log(`Source: ${result.sourceUrl}`);
  }
  if (result.email) {
    console.log(saved ? '→ Saved to DB' : '→ Not saved (dry-run or already has email)');
  }
  if (result.candidates.length > 0) {
    console.log(`Candidates: ${result.candidates.join(', ')}`);
  }

  if (result.results.length > 0) {
    console.log('Top results:');
    for (const item of result.results.slice(0, 3)) {
      console.log(`  [${item.score.toFixed(2)}] ${item.title}`);
      console.log(`    ${item.url}`);
    }
  }
}

async function main(): Promise<void> {
  const { company, title, limit, dryRun, noSync } = parseArgs(process.argv.slice(2));

  try {
    getTavilyConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error('Add TAVILY_API_KEY to .env — key from https://app.tavily.com/');
    process.exitCode = 1;
    return;
  }

  try {
    if (company && !dryRun) {
      const repository = new VacancyRepository();
      const vacancies = repository.findNewWithoutEmailFiltered({ limit, company });

      if (vacancies.length === 0) {
        console.log(`No vacancies with status=new, empty email, company="${company}".`);
        console.log('Running lookup only (no DB write)...');
        const result = await lookupHrEmail({ company, title });
        printLookupResult(company, result);
        return;
      }
    }

    if (dryRun) {
      const repository = new VacancyRepository();
      const vacancies = repository.findNewWithoutEmailFiltered({ limit, company });
      console.log(`[dry-run] Would enrich ${vacancies.length} vacancy/vacancies:`);
      for (const vacancy of vacancies) {
        console.log(`  - [${vacancy.id}] ${vacancy.company}: ${vacancy.title}`);
      }
      return;
    }

    if (company) {
      console.log(`Enriching up to ${limit} vacancies for company "${company}"...`);
    } else {
      console.log(`Enriching up to ${limit} vacancies without email...`);
    }

    const summary = await enrichVacanciesWithTavily({
      limit,
      company,
      syncSheets: !noSync,
      onResult: (label, result, saved) => printLookupResult(label, result, saved),
    });

    console.log('\n=== Tavily enrichment summary ===');
    console.log(`Processed: ${summary.processed}`);
    console.log(`Saved to DB: ${summary.saved}`);
    console.log(`Not found: ${summary.notFound}`);
    console.log(`Failed: ${summary.failed}`);
    if (summary.cacheHits > 0) {
      console.log(`Cache hits: ${summary.cacheHits}`);
    }
    if (summary.skipped > 0) {
      console.log(`Skipped: ${summary.skipped}`);
    }
  } catch (error) {
    if (error instanceof TavilyApiError) {
      console.error(`Tavily API error ${error.status}: ${error.message}`);
      if (error.body) {
        console.error(error.body);
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Tavily lookup failed: ${message}`);
    }
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

if (process.argv[1]?.endsWith('tavilyLookup.ts')) {
  void main();
}
