export type VacancyStatus = 'new' | 'contacted' | 'replied' | 'rejected' | 'archived';
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
}
