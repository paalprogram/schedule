import Database from "better-sqlite3";
import { migrate } from "@/db/migrate";

// Build a fresh in-memory database with the full schema and install it as the
// shared singleton that conflicts.ts and scorer.ts read through. Returns the
// raw handle so tests can seed fixtures.
export function makeTestDb(): Database.Database {
  const db = new Database(":memory:");
  migrate(db);
  globalThis.__scheduleAppSharedDb = db;
  return db;
}

export function clearTestDb() {
  if (globalThis.__scheduleAppSharedDb) {
    globalThis.__scheduleAppSharedDb.close();
    globalThis.__scheduleAppSharedDb = undefined;
  }
}
