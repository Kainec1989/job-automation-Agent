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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

  findAll(): Vacancy[] {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT * FROM vacancies ORDER BY created_at DESC')
      .all() as VacancyRow[];

    return rows.map(mapRow);
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
        SET status = 'contacted', updated_at = datetime('now')
        WHERE id = ?
      `)
      .run(id);

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
