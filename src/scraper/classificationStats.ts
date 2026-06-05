import type { ClassificationResult, ClassificationStatsKey } from './vacancyClassifier.js';

const STATS_LABELS: Record<ClassificationStatsKey, string> = {
  accepted_junior: 'Принято → junior',
  accepted_praktikum: 'Принято → praktikum',
  title_blacklist: 'Отклонено: title blacklist (уровень / чужой стек)',
  experience_blacklist: 'Отклонено: experience blacklist (senior / lead)',
  non_it_blacklist: 'Отклонено: non-IT blacklist',
  sub_tech_only: 'Отклонено: только sub-tech, нет core',
  no_tech: 'Отклонено: нет технологий',
  praktikum_no_it: 'Отклонено: praktikum без IT в заголовке',
};

const totals = new Map<ClassificationStatsKey, number>();
const bySource = new Map<string, Map<ClassificationStatsKey, number>>();

function getSourceMap(source: string): Map<ClassificationStatsKey, number> {
  let map = bySource.get(source);
  if (!map) {
    map = new Map();
    bySource.set(source, map);
  }
  return map;
}

function increment(key: ClassificationStatsKey, source: string): void {
  totals.set(key, (totals.get(key) ?? 0) + 1);
  const sourceMap = getSourceMap(source);
  sourceMap.set(key, (sourceMap.get(key) ?? 0) + 1);
}

export function resetClassificationStats(): void {
  totals.clear();
  bySource.clear();
}

export function recordClassification(source: string, result: ClassificationResult): void {
  increment(result.statsKey, source);
}

export function printClassificationStats(): void {
  const acceptedJunior = totals.get('accepted_junior') ?? 0;
  const acceptedPraktikum = totals.get('accepted_praktikum') ?? 0;
  const accepted = acceptedJunior + acceptedPraktikum;

  const rejectionKeys: ClassificationStatsKey[] = [
    'no_tech',
    'praktikum_no_it',
    'non_it_blacklist',
    'sub_tech_only',
    'title_blacklist',
    'experience_blacklist',
  ];
  const rejected = rejectionKeys.reduce((sum, key) => sum + (totals.get(key) ?? 0), 0);

  const processed = accepted + rejected;

  if (processed === 0) {
    return;
  }

  console.log('\n=== Classification stats ===');
  console.log(`Всего карточек: ${processed}`);
  console.log(`Принято: ${accepted} (junior: ${acceptedJunior}, praktikum: ${acceptedPraktikum})`);
  console.log(`Отклонено: ${rejected}`);

  for (const key of rejectionKeys) {
    const count = totals.get(key) ?? 0;
    if (count > 0) {
      console.log(`  - ${STATS_LABELS[key]}: ${count}`);
    }
  }

  if (bySource.size > 0) {
    console.log('\nПо источникам:');
    for (const [source, sourceMap] of [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const sourceAccepted =
        (sourceMap.get('accepted_junior') ?? 0) + (sourceMap.get('accepted_praktikum') ?? 0);
      const sourceRejected = [...sourceMap.entries()]
        .filter(([key]) => !key.startsWith('accepted_'))
        .reduce((sum, [, count]) => sum + count, 0);
      console.log(`  [${source}] принято ${sourceAccepted}, отклонено ${sourceRejected}`);
    }
  }
}
