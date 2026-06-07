import type { ScrapedVacancy } from '../database/types.js';
import { classifyVacancy } from './vacancyClassifier.js';

function dedupeKey(company: string, title: string): string {
  const normalize = (value: string): string =>
    value
      .toLowerCase()
      .replace(/\(m\/w\/d\)|\(w\/m\/d\)|\(m\/f\/d\)|\(d\/m\/w\)/g, ' ')
      .replace(/[^a-z0-9äöüß]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  return `${normalize(company)}::${normalize(title)}`;
}

/**
 * Collapses the same vacancy posted on multiple boards (same normalized company + title).
 * Keeps the entry with an email if available, otherwise the first seen, merging descriptions.
 */
export function dedupeByCompanyTitle(vacancies: ScrapedVacancy[]): ScrapedVacancy[] {
  const byKey = new Map<string, ScrapedVacancy>();

  for (const vacancy of vacancies) {
    const key = dedupeKey(vacancy.company, vacancy.title);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, vacancy);
      continue;
    }

    byKey.set(key, {
      ...existing,
      description: existing.description ?? vacancy.description ?? null,
      email: existing.email ?? vacancy.email ?? null,
    });
  }

  return [...byKey.values()];
}

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
    const result = classifyVacancy(existing.title, combinedDescription, existing.company);

    if (!result.isFit) {
      // Не удаляем уже принятую вакансию — merge мог добавить текст с blacklist-словами
      continue;
    }

    target.set(vacancy.url, {
      ...existing,
      description: combinedDescription || null,
      email: vacancy.email ?? existing.email ?? null,
      type: result.type,
    });
  }
}
