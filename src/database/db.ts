import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '../config/env.js';

export const VACANCIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS vacancies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    company     TEXT    NOT NULL,
    url         TEXT    NOT NULL UNIQUE,
    email       TEXT,
    description TEXT,
    type        TEXT    NOT NULL DEFAULT 'junior'
                        CHECK (type IN ('junior', 'praktikum')),
    status      TEXT    NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'contacted', 'replied', 'rejected', 'archived')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    sent_at     TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies(status);
  CREATE INDEX IF NOT EXISTS idx_vacancies_company ON vacancies(company);
`;

interface Migration {
  id: string;
  run(db: Database.Database): boolean;
}

const MIGRATIONS: Migration[] = [
  {
    id: '001_add_type_column',
    run(db) {
      const columns = db.pragma('table_info(vacancies)') as Array<{ name: string }>;
      const hasType = columns.some((column) => column.name === 'type');

      if (!hasType) {
        console.log(`Running migration ${this.id}...`);
        db.exec(`
          ALTER TABLE vacancies
          ADD COLUMN type TEXT NOT NULL DEFAULT 'junior'
          CHECK (type IN ('junior', 'praktikum'));

          CREATE INDEX IF NOT EXISTS idx_vacancies_type ON vacancies(type);
        `);
        console.log(`Migration ${this.id} completed successfully.`);
        return true;
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_vacancies_type ON vacancies(type);');
      return false;
    },
  },
  {
    id: '002_add_sent_at_column',
    run(db) {
      const columns = db.pragma('table_info(vacancies)') as Array<{ name: string }>;
      const hasSentAt = columns.some((column) => column.name === 'sent_at');

      if (!hasSentAt) {
        console.log(`Running migration ${this.id}...`);
        db.exec(`ALTER TABLE vacancies ADD COLUMN sent_at TEXT;`);
        console.log(`Migration ${this.id} completed successfully.`);
        return true;
      }

      return false;
    },
  },
];

let db: Database.Database | null = null;

function runMigrations(database: Database.Database): void {
  for (const migration of MIGRATIONS) {
    try {
      migration.run(database);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration "${migration.id}" failed: ${message}`);
    }
  }
}

export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  try {
    mkdirSync(dirname(env.databasePath), { recursive: true });
    db = new Database(env.databasePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(VACANCIES_TABLE_SQL);
    runMigrations(db);
    return db;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize database at ${env.databasePath}: ${message}`);
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
