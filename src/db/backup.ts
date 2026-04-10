import fs from "fs";
import path from "path";
import { getDbPath } from "../lib/db-utils";

const DB_PATH = getDbPath();
const BACKUP_DIR = path.join(path.dirname(DB_PATH), "backups");

/**
 * Create a timestamped backup of the database.
 * Returns the backup file path, or null if the DB doesn't exist.
 */
export function createBackup(label?: string): string | null {
  if (!fs.existsSync(DB_PATH)) {
    console.log("No database file to back up.");
    return null;
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const suffix = label ? `_${label}` : "";
  const backupName = `schedule_${timestamp}${suffix}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  fs.copyFileSync(DB_PATH, backupPath);

  // Also copy WAL/SHM files if they exist (needed for a complete backup)
  for (const ext of ["-wal", "-shm"]) {
    const src = DB_PATH + ext;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, backupPath + ext);
    }
  }

  // Clean up old backups — keep last 20
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("schedule_") && f.endsWith(".db"))
    .sort();

  if (backups.length > 20) {
    const toDelete = backups.slice(0, backups.length - 20);
    for (const file of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, file));
      // Clean up associated WAL/SHM
      for (const ext of ["-wal", "-shm"]) {
        const p = path.join(BACKUP_DIR, file + ext);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
    console.log(`Cleaned up ${toDelete.length} old backup(s).`);
  }

  return backupPath;
}

/**
 * List all available backups.
 */
export function listBackups(): Array<{ name: string; path: string; size: number; date: Date }> {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("schedule_") && f.endsWith(".db"))
    .sort()
    .reverse()
    .map(name => {
      const fullPath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(fullPath);
      return { name, path: fullPath, size: stat.size, date: stat.mtime };
    });
}

/**
 * Restore a backup by name or path.
 */
export function restoreBackup(nameOrPath: string): boolean {
  const backupPath = nameOrPath.includes(path.sep)
    ? nameOrPath
    : path.join(BACKUP_DIR, nameOrPath);

  if (!fs.existsSync(backupPath)) {
    console.error(`Backup not found: ${backupPath}`);
    return false;
  }

  // Back up the current DB before restoring (safety net)
  createBackup("pre-restore");

  fs.copyFileSync(backupPath, DB_PATH);

  // Restore WAL/SHM if they exist, otherwise remove stale ones
  for (const ext of ["-wal", "-shm"]) {
    const src = backupPath + ext;
    const dst = DB_PATH + ext;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    } else if (fs.existsSync(dst)) {
      fs.unlinkSync(dst);
    }
  }

  return true;
}

// ── CLI usage ──
if (require.main === module) {
  const action = process.argv[2];

  if (action === "create" || !action) {
    const label = process.argv[3];
    const backupPath = createBackup(label);
    if (backupPath) {
      const size = fs.statSync(backupPath).size;
      console.log(`Backup created: ${backupPath} (${(size / 1024).toFixed(1)} KB)`);
    }
  } else if (action === "list") {
    const backups = listBackups();
    if (backups.length === 0) {
      console.log("No backups found.");
    } else {
      console.log(`${backups.length} backup(s):\n`);
      for (const b of backups) {
        console.log(`  ${b.name}  (${(b.size / 1024).toFixed(1)} KB)  ${b.date.toLocaleString()}`);
      }
    }
  } else if (action === "restore") {
    const target = process.argv[3];
    if (!target) {
      console.error("Usage: db:restore <backup-name>");
      console.log("\nAvailable backups:");
      const backups = listBackups();
      for (const b of backups) console.log(`  ${b.name}`);
      process.exit(1);
    }
    if (restoreBackup(target)) {
      console.log(`Restored from: ${target}`);
      console.log("A pre-restore backup was also created.");
    } else {
      process.exit(1);
    }
  } else {
    console.log("Usage:");
    console.log("  npx tsx src/db/backup.ts              Create a backup");
    console.log("  npx tsx src/db/backup.ts create [label]  Create a named backup");
    console.log("  npx tsx src/db/backup.ts list          List all backups");
    console.log("  npx tsx src/db/backup.ts restore <name> Restore a backup");
  }
}
