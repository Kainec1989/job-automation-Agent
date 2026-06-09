import { VacancyRepository } from '../database/vacancyRepository.js';
import type { ScrapedVacancy } from '../database/types.js';

export async function persistVacancies(vacancies: ScrapedVacancy[]): Promise<void> {
  const repository = new VacancyRepository();

  const { inserted, updated } = repository.upsertManyByUrl(
    vacancies.map((vacancy) => ({
      title: vacancy.title,
      company: vacancy.company,
      url: vacancy.url,
      email: vacancy.email ?? null,
      description: vacancy.description,
      type: vacancy.type,
    })),
  );

  for (const vacancy of vacancies) {
    const emailSuffix = vacancy.email ? ` → ${vacancy.email}` : '';
    console.log(
      `[Scraper] Saved ${vacancy.type} vacancy: ${vacancy.title} at ${vacancy.company}${emailSuffix}`,
    );
  }

  const withEmail = vacancies.filter((vacancy) => vacancy.email).length;
  console.log(
    `Database sync complete. Inserted: ${inserted}, updated: ${updated}, with email: ${withEmail}`,
  );
}
