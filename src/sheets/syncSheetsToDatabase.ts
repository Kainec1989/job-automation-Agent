import { closeDatabase } from '../database/db.js';
import { VacancyRepository } from '../database/vacancyRepository.js';
import type { VacancyStatus } from '../database/types.js';
import { env } from '../config/env.js';
import { createSheetsClient } from './googleSheetsClient.js';
import { resolveSheetTitle } from './resolveSheetTitle.js';
import { formatSheetRange } from './sheetRange.js';
import { SHEET_COLUMN, SHEET_HEADER } from './sheetSchema.js';

const VALID_STATUSES = new Set<VacancyStatus>([
  'new',
  'contacted',
  'replied',
  'rejected',
  'archived',
]);

export interface SheetsImportSummary {
  rowsRead: number;
  emailsUpdated: number;
  statusesUpdated: number;
  skipped: number;
  errors: number;
}

function cellValue(row: unknown[], index: number): string {
  const value = row[index];
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseStatus(raw: string): VacancyStatus | null {
  const normalized = raw.toLowerCase() as VacancyStatus;
  return VALID_STATUSES.has(normalized) ? normalized : null;
}

function headerMatches(row: unknown[]): boolean {
  if (row.length < SHEET_HEADER.length) {
    return false;
  }

  return SHEET_HEADER.every((label, index) => cellValue(row, index) === label);
}

export async function syncSheetsToDatabase(): Promise<SheetsImportSummary> {
  if (!env.googleSpreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not defined in .env');
  }

  const sheets = createSheetsClient();
  const repository = new VacancyRepository();
  const sheetTitle = await resolveSheetTitle(sheets, env.googleSpreadsheetId, env.googleSheetName);
  const readRange = formatSheetRange(sheetTitle, 'A1:H10000');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSpreadsheetId,
    range: readRange,
  });

  const rows = response.data.values ?? [];
  const summary: SheetsImportSummary = {
    rowsRead: 0,
    emailsUpdated: 0,
    statusesUpdated: 0,
    skipped: 0,
    errors: 0,
  };

  if (rows.length === 0) {
    console.log('[Sheets Import] Sheet is empty.');
    return summary;
  }

  const dataRows = headerMatches(rows[0]) ? rows.slice(1) : rows;

  for (const row of dataRows) {
    summary.rowsRead += 1;

    const id = parseId(cellValue(row, SHEET_COLUMN.id));
    if (!id) {
      summary.skipped += 1;
      continue;
    }

    const emailRaw = cellValue(row, SHEET_COLUMN.email);
    const statusRaw = cellValue(row, SHEET_COLUMN.status);

    try {
      const vacancy = repository.findById(id);
      if (!vacancy) {
        console.warn(`[Sheets Import] Vacancy id=${id} not found in DB, skipped.`);
        summary.skipped += 1;
        continue;
      }

      if (emailRaw && isValidEmail(emailRaw) && emailRaw !== vacancy.email) {
        repository.updateEmail(id, emailRaw);
        summary.emailsUpdated += 1;
        console.log(`[Sheets Import] Email updated: id=${id} ${vacancy.company}`);
      }

      if (statusRaw) {
        const status = parseStatus(statusRaw);
        if (!status) {
          console.warn(`[Sheets Import] Invalid status "${statusRaw}" for id=${id}, skipped.`);
        } else if (status !== vacancy.status) {
          repository.updateStatus(id, status);
          summary.statusesUpdated += 1;
          console.log(`[Sheets Import] Status updated: id=${id} ${vacancy.status} → ${status}`);
        }
      }
    } catch (error) {
      summary.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Sheets Import] Failed for id=${id}: ${message}`);
    }
  }

  return summary;
}

async function main(): Promise<void> {
  try {
    console.log('[Sheets Import] Reading sheet and updating database...');
    const summary = await syncSheetsToDatabase();

    console.log('\n=== Sheets import summary ===');
    console.log(`Rows read: ${summary.rowsRead}`);
    console.log(`Emails updated: ${summary.emailsUpdated}`);
    console.log(`Statuses updated: ${summary.statusesUpdated}`);
    console.log(`Skipped: ${summary.skipped}`);
    console.log(`Errors: ${summary.errors}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Sheets Import] Critical error: ${message}`);
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

if (process.argv[1]?.endsWith('syncSheetsToDatabase.ts')) {
  void main();
}
