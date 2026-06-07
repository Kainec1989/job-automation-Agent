export type VacancyStatus = 'new' | 'contacted' | 'replied' | 'rejected' | 'archived' | 'failed';
export type VacancyType = 'junior' | 'praktikum';

export interface Vacancy {
  id: number;
  title: string;
  company: string;
  url: string;
  email: string | null;
  description: string | null;
  type: VacancyType;
  status: VacancyStatus;
  sentAt: string | null;
  dispatchRetryCount: number;
  lastDispatchAt: string | null;
  dispatchError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVacancyInput {
  title: string;
  company: string;
  url: string;
  email?: string | null;
  description?: string | null;
  type?: VacancyType;
  status?: VacancyStatus;
}

export interface ScrapedVacancy {
  title: string;
  company: string;
  url: string;
  email?: string | null;
  description?: string | null;
  type: VacancyType;
}

export interface PendingVacancy {
  id: number;
  title: string;
  company: string;
  type: VacancyType;
  email: string;
  description: string | null;
  dispatchRetryCount: number;
}

export type DispatchOutcome = 'sent' | 'failed' | 'skipped_invalid_email' | 'skipped_duplicate';

export interface DispatchEventInput {
  vacancyId: number;
  company: string;
  email: string | null;
  outcome: DispatchOutcome;
  error?: string | null;
}
