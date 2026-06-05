/** Форматирует A1-диапазон с экранированием имени листа (пробелы, спецсимволы). */
export function formatSheetRange(sheetName: string, a1Range: string): string {
  const escaped = sheetName.replace(/'/g, "''");
  return `'${escaped}'!${a1Range}`;
}
