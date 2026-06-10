import type { PendingVacancy } from '../database/types.js';

const CORE_TECH = [
  'typescript',
  'javascript',
  'react',
  'node',
  'playwright',
  'qa',
  'test',
  'automation',
  'software',
  'entwickler',
  'developer',
  'frontend',
  'backend',
  'fullstack',
];

const NEGATIVE_SIGNALS = [
  'senior',
  'lead',
  'architect',
  'manager',
  'werkstudent',
  'working student',
  '.net',
  'c#',
  'java ',
];

/** Rule-based fit score 0–100 for dispatch ranking (no extra API calls). */
export function scoreVacancyFit(vacancy: Pick<PendingVacancy, 'title' | 'company' | 'type' | 'description' | 'email'>): number {
  const haystack = `${vacancy.title} ${vacancy.description ?? ''}`.toLowerCase();
  let score = 50;

  if (vacancy.type === 'junior') {
    score += 15;
  }

  const techHits = CORE_TECH.filter((term) => haystack.includes(term)).length;
  score += Math.min(techHits * 4, 20);

  if ((vacancy.description?.length ?? 0) > 400) {
    score += 8;
  }

  if (vacancy.email.includes('bewerbung@') || vacancy.email.includes('karriere@') || vacancy.email.includes('jobs@')) {
    score += 6;
  }

  for (const negative of NEGATIVE_SIGNALS) {
    if (haystack.includes(negative)) {
      score -= 12;
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function rankVacanciesByFit<T extends Pick<PendingVacancy, 'title' | 'company' | 'type' | 'description' | 'email'>>(
  vacancies: T[],
): Array<T & { fitScore: number }> {
  return vacancies
    .map((vacancy) => ({ ...vacancy, fitScore: scoreVacancyFit(vacancy) }))
    .sort((a, b) => {
      if (b.fitScore !== a.fitScore) {
        return b.fitScore - a.fitScore;
      }
      if (a.type !== b.type) {
        return a.type === 'junior' ? -1 : 1;
      }
      return 0;
    });
}
