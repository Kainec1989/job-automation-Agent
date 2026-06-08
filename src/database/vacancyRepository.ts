import type {
  CreateVacancyInput,
  DispatchEventInput,
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
  dispatch_retry_count: number;
  last_dispatch_at: string | null;
  dispatch_error: string | null;
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
    dispatchRetryCount: row.dispatch_retry_count ?? 0,
    lastDispatchAt: row.last_dispatch_at,
    dispatchError: row.dispatch_error,
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
          WHEN vacancies.status IN ('contacted', 'replied', 'rejected', 'archived', 'failed')
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

    // One representative row per company so each lookup covers a *distinct*
    // company. Otherwise multi-posting companies (e.g. 27 listings) would eat
    // the whole batch and only a couple of companies would ever be queried.
    return db
      .prepare(`
        SELECT id, title, company, url
        FROM vacancies v
        WHERE status = 'new'
          AND (email IS NULL OR trim(email) = '')
          AND id = (
            SELECT v2.id
            FROM vacancies v2
            WHERE v2.status = 'new'
              AND (v2.email IS NULL OR trim(v2.email) = '')
              AND lower(trim(v2.company)) = lower(trim(v.company))
            ORDER BY v2.created_at DESC, v2.id DESC
            LIMIT 1
          )
        ORDER BY
          CASE
            WHEN lower(company) LIKE '%gmbh%'
              OR lower(company) LIKE '% ag%'
              OR lower(company) LIKE '% ag'
              OR lower(company) LIKE '%gruppe%'
              OR lower(company) LIKE '% ug%'
              THEN 0
            WHEN lower(company) LIKE '% se%'
              OR lower(company) LIKE '% kg%'
              THEN 1
            ELSE 2
          END,
          created_at DESC
        LIMIT ?
      `)
      .all(options.limit) as Array<Pick<Vacancy, 'id' | 'title' | 'company' | 'url'>>;
  }

  clearEmail(id: number): boolean {
    const db = getDatabase();

    const result = db
      .prepare(`
        UPDATE vacancies
        SET email = NULL, updated_at = datetime('now')
        WHERE id = ?
          AND status = 'new'
      `)
      .run(id);

    return result.changes > 0;
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

  findPendingWithEmail(limit: number, maxRetries: number): PendingVacancy[] {
    const db = getDatabase();

    // De-duplicates so we never email the same company or HR address twice:
    //  - excludes companies/emails that already have a contacted/replied/rejected row
    //  - returns at most one representative row per company among eligible 'new' rows
    return db
      .prepare(`
        SELECT id, title, company, type, email, description, dispatch_retry_count
        FROM vacancies v
        WHERE status = 'new'
          AND email IS NOT NULL
          AND trim(email) != ''
          AND dispatch_retry_count < ?
          AND (
            last_dispatch_at IS NULL
            OR date(last_dispatch_at) < date('now')
          )
          AND lower(trim(company)) NOT IN (
            SELECT lower(trim(company))
            FROM vacancies
            WHERE status IN ('contacted', 'replied', 'rejected')
          )
          AND lower(trim(email)) NOT IN (
            SELECT lower(trim(email))
            FROM vacancies
            WHERE email IS NOT NULL
              AND trim(email) != ''
              AND status IN ('contacted', 'replied', 'rejected')
          )
          AND id = (
            SELECT v2.id
            FROM vacancies v2
            WHERE lower(trim(v2.company)) = lower(trim(v.company))
              AND v2.status = 'new'
              AND v2.email IS NOT NULL
              AND trim(v2.email) != ''
              AND v2.dispatch_retry_count < ?
              AND (
                v2.last_dispatch_at IS NULL
                OR date(v2.last_dispatch_at) < date('now')
              )
            ORDER BY
              CASE WHEN v2.type = 'junior' THEN 0 ELSE 1 END,
              v2.created_at ASC,
              v2.id ASC
            LIMIT 1
          )
        ORDER BY
          CASE WHEN type = 'junior' THEN 0 ELSE 1 END,
          created_at ASC
        LIMIT ?
      `)
      .all(maxRetries, maxRetries, limit) as PendingVacancy[];
  }

  recordDispatchFailure(id: number, error: string, maxRetries: number): 'retry' | 'failed' {
    const db = getDatabase();
    const trimmedError = error.slice(0, 500);

    const result = db
      .prepare(`
        UPDATE vacancies
        SET dispatch_retry_count = dispatch_retry_count + 1,
            last_dispatch_at = datetime('now'),
            dispatch_error = ?,
            status = CASE
              WHEN dispatch_retry_count + 1 >= ? THEN 'failed'
              ELSE status
            END,
            updated_at = datetime('now')
        WHERE id = ?
          AND status = 'new'
      `)
      .run(trimmedError, maxRetries, id);

    if (result.changes === 0) {
      throw new Error(`Cannot record dispatch failure: id=${id}`);
    }

    const vacancy = this.findById(id);
    return vacancy?.status === 'failed' ? 'failed' : 'retry';
  }

  recordDispatchEvent(input: DispatchEventInput): void {
    const db = getDatabase();

    db.prepare(`
      INSERT INTO dispatch_events (vacancy_id, company, email, outcome, error)
      VALUES (@vacancyId, @company, @email, @outcome, @error)
    `).run({
      vacancyId: input.vacancyId,
      company: input.company,
      email: input.email ?? null,
      outcome: input.outcome,
      error: input.error ? input.error.slice(0, 500) : null,
    });
  }

  /** Number of successfully sent applications since the start of the current day. */
  countSentToday(): number {
    const db = getDatabase();
    const row = db
      .prepare(`
        SELECT count(*) AS c
        FROM dispatch_events
        WHERE outcome = 'sent'
          AND date(created_at) = date('now')
      `)
      .get() as { c: number };

    return row.c;
  }

  /** Number of successfully sent applications to a given email domain since the start of the current day. */
  countSentToDomainToday(domain: string): number {
    const db = getDatabase();
    const row = db
      .prepare(`
        SELECT count(*) AS c
        FROM dispatch_events
        WHERE outcome = 'sent'
          AND date(created_at) = date('now')
          AND lower(email) LIKE '%@' || lower(?)
      `)
      .get(domain.toLowerCase()) as { c: number };

    return row.c;
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

    // Archived rows were deduped or manually closed — never resurrect from a stale sheet.
    if (current === 'archived') {
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

  resetDispatchState(id: number): void {
    const db = getDatabase();

    db.prepare(`
      UPDATE vacancies
      SET dispatch_retry_count = 0,
          last_dispatch_at = NULL,
          dispatch_error = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
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
