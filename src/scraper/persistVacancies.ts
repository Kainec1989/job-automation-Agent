import { VacancyRepository } from '../database/vacancyRepository.js';
import type { ScrapedVacancy } from '../database/types.js';

export async function persistVacancies(vacancies: ScrapedVacancy[]): Promise<void> {
  const repository = new VacancyRepository();
  let inserted = 0;
  let updated = 0;

  for (const vacancy of vacancies) {
    const existing = repository.findByUrl(vacancy.url);

    repository.upsertByUrl({
      title: vacancy.title,
      company: vacancy.company,
      url: vacancy.url,
      email: vacancy.email ?? null,
      description: vacancy.description,
      type: vacancy.type,
    });

    const emailSuffix = vacancy.email ? ` → ${vacancy.email}` : '';

    if (existing) {
      updated += 1;
      console.log(
        `[Scraper] Updated ${vacancy.type} vacancy: ${vacancy.title} at ${vacancy.company}${emailSuffix}`,
      );
    } else {
      inserted += 1;
      console.log(
        `[Scraper] New ${vacancy.type} vacancy saved: ${vacancy.title} at ${vacancy.company}${emailSuffix}`,
      );
    }
  }

  const withEmail = vacancies.filter((vacancy) => vacancy.email).length;
  console.log(
    `Database sync complete. Inserted: ${inserted}, updated: ${updated}, with email: ${withEmail}`,
  );
}
