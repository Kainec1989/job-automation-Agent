import { getDatabase, closeDatabase } from './db.js';
import { env } from '../config/env.js';

try {
  const db = getDatabase();
  const count = db.prepare('SELECT COUNT(*) AS total FROM vacancies').get() as { total: number };
  console.log(`Database initialized at: ${env.databasePath}`);
  console.log(`Vacancies in database: ${count.total}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Database initialization failed: ${message}`);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
