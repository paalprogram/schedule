import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * Resolve the database path.
 *
 * Priority:
 *   1. DB_PATH env var (explicit override)
 *   2. C:\ProgramData\scheduleapp\schedule.db (local-only, avoids OneDrive sync issues)
 *   3. ./data/schedule.db (fallback for dev / non-Windows)
 *
 * SQLite + OneDrive is risky because OneDrive can sync the .db, .db-wal, and
 * .db-shm files independently, corrupting the database. Using a local path
 * outside OneDrive prevents this.
 */
export function getDbPath(): string {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }

  // On Windows, use a local-only directory outside OneDrive
  if (process.platform === "win32") {
    const localDir = path.join("C:", "ProgramData", "scheduleapp");
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    const localPath = path.join(localDir, "schedule.db");

    // One-time migration: if the old path has data but the new one doesn't, copy it
    const oldPath = path.join(process.cwd(), "data", "schedule.db");
    if (!fs.existsSync(localPath) && fs.existsSync(oldPath)) {
      fs.copyFileSync(oldPath, localPath);
      for (const ext of ["-wal", "-shm"]) {
        if (fs.existsSync(oldPath + ext)) fs.copyFileSync(oldPath + ext, localPath + ext);
      }
      console.log(`Database migrated to local path: ${localPath}`);
    }

    return localPath;
  }

  // Non-Windows fallback
  return path.join(process.cwd(), "data", "schedule.db");
}

export function getDb(readonly = false) {
  const dbPath = getDbPath();
  const db = new Database(dbPath, { readonly });
  db.pragma("foreign_keys = ON");
  return db;
}
