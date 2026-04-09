import Database from "better-sqlite3";
import path from "path";

export function getDb(readonly = false) {
  const dbPath = path.join(process.cwd(), "data", "schedule.db");
  const db = new Database(dbPath, { readonly });
  db.pragma("foreign_keys = ON");
  return db;
}
