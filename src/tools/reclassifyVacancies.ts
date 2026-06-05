import { closeDatabase } from '../database/db.js';
import { VacancyRepository } from '../database/vacancyRepository.js';
import { classifyVacancy } from '../scraper/vacancyClassifier.js';

export function reclassifyVacancies(): {
  processed: number;
  archived: number;
  typeUpdated: number;
  unchanged: number;
  skipped: number;
} {
  const repository = new VacancyRepository();
  const vacancies = repository.findAll();

  let archived = 0;
  let typeUpdated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const vacancy of vacancies) {
    if (vacancy.status !== 'new') {
      skipped += 1;
      continue;
    }

    const result = classifyVacancy(vacancy.title, vacancy.description);

    if (!result.isFit) {
      repository.markArchived(vacancy.id);
      archived += 1;
      console.log(`[Archive] ${vacancy.company}: ${vacancy.title} — ${result.reason}`);
      continue;
    }

    if (result.type !== vacancy.type) {
      repository.updateType(vacancy.id, result.type);
      typeUpdated += 1;
      console.log(`[Type] ${vacancy.company}: ${vacancy.type} → ${result.type}`);
      continue;
    }

    unchanged += 1;
  }

  return {
    processed: vacancies.length,
    archived,
    typeUpdated,
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
