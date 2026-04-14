import { NextResponse } from "next/server";
import { getDb, getDbPath } from "@/lib/db-utils";
import fs from "fs";

// GET /api/backup — download a safe copy of the database
export async function GET() {
  const dbPath = getDbPath();

  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: "Database not found" }, { status: 404 });
  }

  // VACUUM INTO creates a clean, consistent snapshot (safe during concurrent writes)
  const backupPath = dbPath + ".download";
  const db = getDb(true);
  db.exec(`VACUUM INTO '${backupPath}'`);
  db.close();

  const fileBuffer = fs.readFileSync(backupPath);
  fs.unlinkSync(backupPath);

  const timestamp = new Date().toISOString().split("T")[0];
  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Disposition": `attachment; filename="schedule-backup-${timestamp}.db"`,
    },
  });
}
