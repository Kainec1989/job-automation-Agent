import type { ScrapedVacancy } from '../database/types.js';
import { classifyVacancy } from './vacancyClassifier.js';

export function mergeVacancies(
  target: Map<string, ScrapedVacancy>,
  incoming: ScrapedVacancy[],
): void {
  for (const vacancy of incoming) {
    const existing = target.get(vacancy.url);

    if (!existing) {
      target.set(vacancy.url, vacancy);
      continue;
    }

    const combinedDescription = [existing.description, vacancy.description].filter(Boolean).join(' ');
    const result = classifyVacancy(existing.title, combinedDescription);

    if (!result.isFit) {
      // Не удаляем уже принятую вакансию — merge мог добавить текст с blacklist-словами
      continue;
    }

    target.set(vacancy.url, {
      ...existing,
      description: combinedDescription || null,
      type: result.type,
    });
  }
}
