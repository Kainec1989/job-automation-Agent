import { closeDatabase } from '../database/db.js';
import { VacancyRepository } from '../database/vacancyRepository.js';
import { env } from '../config/env.js';
import { createSheetsClient } from './googleSheetsClient.js';
import { resolveSheetTitle } from './resolveSheetTitle.js';
import { formatSheetRange } from './sheetRange.js';
import { SHEET_HEADER } from './sheetSchema.js';

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
