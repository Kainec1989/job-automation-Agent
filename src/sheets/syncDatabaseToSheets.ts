import type { sheets_v4 } from 'googleapis';
import { closeDatabase } from '../database/db.js';
import { VacancyRepository } from '../database/vacancyRepository.js';
import { env } from '../config/env.js';
import { createSheetsClient } from './googleSheetsClient.js';
import { formatSheetRange } from './sheetRange.js';

const SHEET_HEADER = [
  'ID',
  'Position Title',
  'Company',
  'URL',
  'Email (HR)',
  'Status',
  'Type',
  'Scraped At',
] as const;

function buildSheetData(): (string | number)[][] {
  const repository = new VacancyRepository();
  const vacancies = repository.findAll();

  return [
    [...SHEET_HEADER],
    ...vacancies.map((vacancy) => [
      vacancy.id,
      vacancy.title,
      vacancy.company,
      vacancy.url,
      vacancy.email ?? '',
      vacancy.status,
      vacancy.type,
      vacancy.createdAt,
    ]),
  ];
}

async function resolveSheetTitle(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  requestedName: string,
): Promise<string> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });

  const titles =
    response.data.sheets
      ?.map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title)) ?? [];

  const match = titles.find((title) => title === requestedName);

  if (!match) {
    throw new Error(
      `Sheet tab "${requestedName}" not found. Available tabs: ${titles.join(', ') || '(none)'}`,
    );
  }

  return match;
}

export async function syncDatabaseToSheets(): Promise<void> {
  if (!env.googleSpreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not defined in .env');
  }

  const sheets = createSheetsClient();
  const sheetTitle = await resolveSheetTitle(sheets, env.googleSpreadsheetId, env.googleSheetName);
  const sheetData = buildSheetData();
  const rowCount = sheetData.length - 1;

  const clearRange = formatSheetRange(sheetTitle, 'A1:Z10000');
  const writeRange = formatSheetRange(sheetTitle, 'A1');

  console.log(`[Sheets Sync] Target sheet: "${sheetTitle}"`);
  console.log(`[Sheets Sync] Preparing to upload ${rowCount} rows to Google Sheets...`);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: env.googleSpreadsheetId,
    range: clearRange,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSpreadsheetId,
    range: writeRange,
    valueInputOption: 'RAW',
    requestBody: {
      values: sheetData,
    },
  });

  console.log('[Sheets Sync] Synchronization completed successfully!');
}

async function main(): Promise<void> {
  try {
    await syncDatabaseToSheets();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Sheets Sync] Critical error during sync: ${message}`);
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

if (process.argv[1]?.endsWith('syncDatabaseToSheets.ts')) {
  void main();
}
