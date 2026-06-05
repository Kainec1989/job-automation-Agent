import type { sheets_v4 } from 'googleapis';

export async function resolveSheetTitle(
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
