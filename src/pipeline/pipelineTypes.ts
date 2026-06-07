import type { runDispatchApplications } from '../dispatcher/runDailyApplicationPipeline.js';
import type { enrichVacanciesWithTavily } from '../enrichment/tavily/enrichDatabase.js';
import type { SheetsImportSummary } from '../sheets/syncSheetsToDatabase.js';
import type { reclassifyVacancies } from '../tools/reclassifyVacancies.js';

export interface DailyPipelineOptions {
  skipScrape?: boolean;
  skipReclassify?: boolean;
  skipSheets?: boolean;
  skipSheetsImport?: boolean;
  skipTavily?: boolean;
  skipDispatch?: boolean;
  skipNotify?: boolean;
}

export interface DailyPipelineSummary {
  scraped: number | null;
  sheetsImport: SheetsImportSummary | null;
  reclassify: ReturnType<typeof reclassifyVacancies> | null;
  sheetsSynced: boolean;
  tavily: Awaited<ReturnType<typeof enrichVacanciesWithTavily>> | null;
  dispatch: Awaited<ReturnType<typeof runDispatchApplications>> | null;
  healthWarnings: string[];
}
