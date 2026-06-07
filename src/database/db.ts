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
                        CHECK (status IN ('new', 'contacted', 'replied', 'rejected', 'archived', 'failed')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    sent_at     TEXT,
    dispatch_retry_count INTEGER NOT NULL DEFAULT 0,
    last_dispatch_at TEXT,
    dispatch_error TEXT
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
  {
    id: '003_tavily_email_cache',
    run(db) {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tavily_email_cache'")
        .get() as { name: string } | undefined;

      if (!tables) {
        console.log(`Running migration ${this.id}...`);
        db.exec(`
          CREATE TABLE IF NOT EXISTS tavily_email_cache (
            company_key   TEXT PRIMARY KEY,
            email         TEXT,
            source_url    TEXT,
            looked_up_at  TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);
        console.log(`Migration ${this.id} completed successfully.`);
        return true;
      }

      return false;
    },
  },
  {
    id: '004_dispatch_tracking',
    run(db) {
      const columns = db.pragma('table_info(vacancies)') as Array<{ name: string }>;
      const hasRetryCount = columns.some((column) => column.name === 'dispatch_retry_count');

      if (hasRetryCount) {
        return false;
      }

      console.log(`Running migration ${this.id}...`);
      db.exec(`
        CREATE TABLE vacancies_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          title       TEXT    NOT NULL,
          company     TEXT    NOT NULL,
          url         TEXT    NOT NULL UNIQUE,
          email       TEXT,
          description TEXT,
          type        TEXT    NOT NULL DEFAULT 'junior'
                          CHECK (type IN ('junior', 'praktikum')),
          status      TEXT    NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'contacted', 'replied', 'rejected', 'archived', 'failed')),
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          sent_at     TEXT,
          dispatch_retry_count INTEGER NOT NULL DEFAULT 0,
          last_dispatch_at TEXT,
          dispatch_error TEXT
        );

        INSERT INTO vacancies_new (
          id, title, company, url, email, description, type, status,
          created_at, updated_at, sent_at, dispatch_retry_count, last_dispatch_at, dispatch_error
        )
        SELECT
          id, title, company, url, email, description, type, status,
          created_at, updated_at, sent_at, 0, NULL, NULL
        FROM vacancies;

        DROP TABLE vacancies;
        ALTER TABLE vacancies_new RENAME TO vacancies;

        CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies(status);
        CREATE INDEX IF NOT EXISTS idx_vacancies_company ON vacancies(company);
        CREATE INDEX IF NOT EXISTS idx_vacancies_type ON vacancies(type);
      `);
      console.log(`Migration ${this.id} completed successfully.`);
      return true;
    },
  },
  {
    id: '005_dispatch_events',
    run(db) {
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dispatch_events'")
        .get() as { name: string } | undefined;

      if (table) {
        return false;
      }

      console.log(`Running migration ${this.id}...`);
      db.exec(`
        CREATE TABLE dispatch_events (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          vacancy_id  INTEGER NOT NULL,
          company     TEXT,
          email       TEXT,
          outcome     TEXT    NOT NULL,
          error       TEXT,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_dispatch_events_vacancy ON dispatch_events(vacancy_id);
        CREATE INDEX IF NOT EXISTS idx_dispatch_events_created ON dispatch_events(created_at);
      `);
      console.log(`Migration ${this.id} completed successfully.`);
      return true;
    },
  },
  {
    id: '006_performance_indexes',
    run(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_vacancies_created ON vacancies(created_at);
        CREATE INDEX IF NOT EXISTS idx_vacancies_email ON vacancies(email);
      `);
      return false;
    },
  },
  {
    id: '007_cover_letter_cache',
    run(db) {
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cover_letter_cache'")
        .get() as { name: string } | undefined;

      if (table) {
        return false;
      }

      console.log(`Running migration ${this.id}...`);
      db.exec(`
        CREATE TABLE cover_letter_cache (
          cache_key    TEXT PRIMARY KEY,
          subject      TEXT NOT NULL,
          body         TEXT NOT NULL,
          created_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      console.log(`Migration ${this.id} completed successfully.`);
      return true;
    },
  },
  {
    id: '008_cover_letter_email_body',
    run(db) {
      const columns = db
        .prepare("PRAGMA table_info('cover_letter_cache')")
        .all() as Array<{ name: string }>;

      if (columns.some((column) => column.name === 'email_body')) {
        return false;
      }

      console.log(`Running migration ${this.id}...`);
      db.exec("ALTER TABLE cover_letter_cache ADD COLUMN email_body TEXT NOT NULL DEFAULT ''");
      console.log(`Migration ${this.id} completed successfully.`);
      return true;
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
