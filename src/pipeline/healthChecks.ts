import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDatabase } from '../database/db.js';
import { env } from '../config/env.js';
import type { DailyPipelineSummary } from './pipelineTypes.js';

const BACKUP_MAX_AGE_HOURS = 26;

function newestBackupAgeHours(): number | null {
  const backupDir = join(dirname(env.databasePath), 'backups');
  if (!existsSync(backupDir)) {
    return null;
  }

  let newest = 0;
  for (const name of readdirSync(backupDir)) {
    if (!name.startsWith('vacancies-') || !name.endsWith('.db')) {
      continue;
    }
    const mtime = statSync(join(backupDir, name)).mtimeMs;
    if (mtime > newest) {
      newest = mtime;
    }
  }

  if (newest === 0) {
    return null;
  }

  return (Date.now() - newest) / (1000 * 60 * 60);
}

function countSentDispatchEventsToday(): number {
  try {
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c
         FROM dispatch_events
         WHERE outcome = 'sent'
           AND date(created_at) = date('now')`,
      )
      .get() as { c: number };
    return row.c;
  } catch {
    return -1;
  }
}

/**
 * Lightweight post-run consistency checks surfaced in the notification, so a
 * silent regression (missing backup, dispatch history not recorded) is visible.
 */
export function collectHealthWarnings(summary: DailyPipelineSummary): string[] {
  const warnings: string[] = [];

  const backupAge = newestBackupAgeHours();
  if (backupAge === null) {
    warnings.push('Бэкап БД не найден (data/backups пуст) — проверь шаг бэкапа в cron-скрипте.');
  } else if (backupAge > BACKUP_MAX_AGE_HOURS) {
    warnings.push(`Последний бэкап БД старше ${Math.round(backupAge)} ч — бэкап мог не выполниться.`);
  }

  const sent = summary.dispatch?.sent ?? 0;
  if (sent > 0) {
    const recorded = countSentDispatchEventsToday();
    if (recorded === 0) {
      warnings.push(
        `Отправлено ${sent}, но история в dispatch_events не записалась — проверь recordDispatchEvent.`,
      );
    }
  }

  return warnings;
}
