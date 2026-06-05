import { closeDatabase } from '../database/db.js';
import { VacancyRepository } from '../database/vacancyRepository.js';
import { isPlausibleHrEmail } from '../scraper/hrEmailValidation.js';
import { sanitizeJobFields } from '../scraper/sanitizeJobFields.js';
import { classifyVacancy } from '../scraper/vacancyClassifier.js';

export function reclassifyVacancies(): {
  processed: number;
  archived: number;
  typeUpdated: number;
  fieldsCleaned: number;
  emailsCleared: number;
  unchanged: number;
  skipped: number;
} {
  const repository = new VacancyRepository();
  const vacancies = repository.findAll();

  let archived = 0;
  let typeUpdated = 0;
  let fieldsCleaned = 0;
  let emailsCleared = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const vacancy of vacancies) {
    if (vacancy.status !== 'new') {
      skipped += 1;
      continue;
    }

    const { title, company } = sanitizeJobFields(vacancy.title, vacancy.company);
    if (title !== vacancy.title || company !== vacancy.company) {
      repository.updateJobFields(vacancy.id, title, company);
      fieldsCleaned += 1;
      console.log(`[Clean] ${company}: ${title}`);
    }

    if (vacancy.email && !isPlausibleHrEmail(vacancy.email, company)) {
      repository.clearEmail(vacancy.id);
      emailsCleared += 1;
      console.log(`[Email] Cleared invalid ${vacancy.email} for ${company}`);
    }

    const result = classifyVacancy(title, vacancy.description, company);

    if (!result.isFit) {
      repository.markArchived(vacancy.id);
      archived += 1;
      console.log(`[Archive] ${company}: ${title} — ${result.reason}`);
      continue;
    }

    if (result.type !== vacancy.type) {
      repository.updateType(vacancy.id, result.type);
      typeUpdated += 1;
      console.log(`[Type] ${company}: ${vacancy.type} → ${result.type}`);
      continue;
    }

    unchanged += 1;
  }

  return {
    processed: vacancies.length,
    archived,
    typeUpdated,
    fieldsCleaned,
    emailsCleared,
    unchanged,
    skipped,
  };
}

async function main(): Promise<void> {
  try {
    const summary = reclassifyVacancies();

    console.log('\n=== Reclassify summary ===');
    console.log(`Total in DB: ${summary.processed}`);
    console.log(`Skipped (not new): ${summary.skipped}`);
    console.log(`Archived: ${summary.archived}`);
    console.log(`Fields cleaned: ${summary.fieldsCleaned}`);
    console.log(`Invalid emails cleared: ${summary.emailsCleared}`);
    console.log(`Type updated: ${summary.typeUpdated}`);
    console.log(`Unchanged: ${summary.unchanged}`);
    console.log(`Active (new): ${summary.unchanged + summary.typeUpdated}`);
  } finally {
    closeDatabase();
  }
}

if (process.argv[1]?.endsWith('reclassifyVacancies.ts')) {
  void main();
}
