import type {
  CreateVacancyInput,
  PendingVacancy,
  Vacancy,
  VacancyStatus,
  VacancyType,
} from './types.js';
import { getDatabase } from './db.js';

interface VacancyRow {
  id: number;
  title: string;
  company: string;
  url: string;
  email: string | null;
  description: string | null;
  type: VacancyType;
  status: VacancyStatus;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: VacancyRow): Vacancy {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    url: row.url,
    email: row.email,
    description: row.description,
    type: row.type,
    status: row.status,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const LOCKED_STATUSES = new Set<VacancyStatus>(['contacted', 'replied', 'rejected', 'archived']);

export class VacancyRepository {
  insert(input: CreateVacancyInput): Vacancy {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO vacancies (title, company, url, email, description, type, status)
      VALUES (@title, @company, @url, @email, @description, @type, @status)
    `);

    try {
      const result = stmt.run({
        title: input.title,
        company: input.company,
        url: input.url,
        email: input.email ?? null,
        description: input.description ?? null,
        type: input.type ?? 'junior',
        status: input.status ?? 'new',
      });

      const row = db
        .prepare('SELECT * FROM vacancies WHERE id = ?')
        .get(result.lastInsertRowid) as VacancyRow;

      return mapRow(row);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new DuplicateVacancyError(input.url);
      }
      throw error;
    }
  }

  upsertByUrl(input: CreateVacancyInput): Vacancy {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO vacancies (title, company, url, email, description, type, status)
      VALUES (@title, @company, @url, @email, @description, @type, @status)
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        company = excluded.company,
        email = COALESCE(excluded.email, vacancies.email),
        description = COALESCE(excluded.description, vacancies.description),
        type = excluded.type,
        status = CASE
          WHEN vacancies.status IN ('contacted', 'replied', 'rejected', 'archived')
          THEN vacancies.status
          ELSE excluded.status
        END,
        updated_at = datetime('now')
      RETURNING *
    `);

    const row = stmt.get({
      title: input.title,
      company: input.company,
      url: input.url,
      email: input.email ?? null,
      description: input.description ?? null,
      type: input.type ?? 'junior',
      status: input.status ?? 'new',
    }) as VacancyRow;

    return mapRow(row);
  }

  findByUrl(url: string): Vacancy | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM vacancies WHERE url = ?')
      .get(url) as VacancyRow | undefined;

    return row ? mapRow(row) : null;
  }

  findById(id: number): Vacancy | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM vacancies WHERE id = ?')
      .get(id) as VacancyRow | undefined;

    return row ? mapRow(row) : null;
  }

  findAll(): Vacancy[] {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT * FROM vacancies ORDER BY created_at DESC')
      .all() as VacancyRow[];

    return rows.map(mapRow);
  }

  findNewWithoutEmail(limit: number): Array<Pick<Vacancy, 'id' | 'title' | 'company' | 'url'>> {
    return this.findNewWithoutEmailFiltered({ limit });
  }

  findNewWithoutEmailFiltered(options: {
    limit: number;
    company?: string;
  }): Array<Pick<Vacancy, 'id' | 'title' | 'company' | 'url'>> {
    const db = getDatabase();
    const company = options.company?.trim();

    if (company) {
      return db
        .prepare(`
          SELECT id, title, company, url
          FROM vacancies
          WHERE status = 'new'
            AND (email IS NULL OR trim(email) = '')
            AND lower(company) = lower(?)
          ORDER BY created_at DESC
          LIMIT ?
        `)
        .all(company, options.limit) as Array<Pick<Vacancy, 'id' | 'title' | 'company' | 'url'>>;
    }

    return db
      .prepare(`
        SELECT id, title, company, url
        FROM vacancies
        WHERE status = 'new'
          AND (email IS NULL OR trim(email) = '')
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(options.limit) as Array<Pick<Vacancy, 'id' | 'title' | 'company' | 'url'>>;
  }

  updateEmailIfNew(id: number, email: string): boolean {
    const db = getDatabase();

    const result = db
      .prepare(`
        UPDATE vacancies
        SET email = ?, updated_at = datetime('now')
        WHERE id = ?
          AND status = 'new'
          AND (email IS NULL OR trim(email) = '')
      `)
      .run(email.trim(), id);

    return result.changes > 0;
  }

  findPendingWithEmail(limit: number): PendingVacancy[] {
    const db = getDatabase();

    return db
      .prepare(`
        SELECT id, title, company, type, email, description
        FROM vacancies
        WHERE status = 'new'
          AND email IS NOT NULL
          AND trim(email) != ''
        ORDER BY created_at ASC
        LIMIT ?
      `)
      .all(limit) as PendingVacancy[];
  }

  markContacted(id: number): void {
    const db = getDatabase();

    const result = db
      .prepare(`
        UPDATE vacancies
        SET status = 'contacted',
            sent_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
          AND status = 'new'
      `)
      .run(id);

    if (result.changes === 0) {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Vacancy not found: id=${id}`);
      }

      if (existing.status === 'contacted') {
        return;
      }

      throw new Error(`Cannot mark as contacted: id=${id} has status=${existing.status}`);
    }
  }

  canImportStatusFromSheets(current: VacancyStatus, incoming: VacancyStatus): boolean {
    if (current === incoming) {
      return false;
    }

    if (LOCKED_STATUSES.has(current) && incoming === 'new') {
      return false;
    }

    return true;
  }

  updateJobFields(id: number, title: string, company: string): void {
    const db = getDatabase();

    const result = db
      .prepare(`
        UPDATE vacancies
        SET title = ?, company = ?, updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(title, company, id);

    if (result.changes === 0) {
      throw new Error(`Vacancy not found: id=${id}`);
    }
  }

  updateType(id: number, type: VacancyType): void {
    const db = getDatabase();

    const result = db
      .prepare(`
        UPDATE vacancies
        SET type = ?, updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(type, id);

    if (result.changes === 0) {
      throw new Error(`Vacancy not found: id=${id}`);
    }
  }

  markArchived(id: number): void {
    this.updateStatus(id, 'archived');
  }

  updateEmail(id: number, email: string): void {
    const db = getDatabase();

    const result = db
      .prepare(`
        UPDATE vacancies
        SET email = ?, updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(email, id);

    if (result.changes === 0) {
      throw new Error(`Vacancy not found: id=${id}`);
    }
  }

  updateStatus(id: number, status: VacancyStatus): void {
    const db = getDatabase();

    const result = db
      .prepare(`
        UPDATE vacancies
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(status, id);

    if (result.changes === 0) {
      throw new Error(`Vacancy not found: id=${id}`);
    }
  }
}

export class DuplicateVacancyError extends Error {
  constructor(public readonly url: string) {
    super(`Vacancy with URL already exists: ${url}`);
    this.name = 'DuplicateVacancyError';
  }
}
