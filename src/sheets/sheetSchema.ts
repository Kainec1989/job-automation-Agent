export const SHEET_HEADER = [
  'ID',
  'Position Title',
  'Company',
  'URL',
  'Email (HR)',
  'Status',
  'Type',
  'Scraped At',
] as const;

export const SHEET_COLUMN = {
  id: 0,
  title: 1,
  company: 2,
  url: 3,
  email: 4,
  status: 5,
  type: 6,
  scrapedAt: 7,
} as const;
