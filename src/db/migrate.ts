import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "schedule.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'direct_care',
    active INTEGER DEFAULT 1,
    can_work_overnight INTEGER DEFAULT 0,
    can_cover_swim INTEGER DEFAULT 0,
    max_hours_per_week INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS student (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    requires_swim_support INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS staff_student_training (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    student_id INTEGER NOT NULL REFERENCES student(id),
    approved INTEGER DEFAULT 1,
    certified_date TEXT,
    notes TEXT,
    UNIQUE(staff_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS staff_availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff_pto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT
  );

  CREATE TABLE IF NOT EXISTS shift (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES student(id),
    assigned_staff_id INTEGER REFERENCES staff(id),
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    shift_type TEXT DEFAULT 'regular',
    activity_type TEXT DEFAULT 'general',
    needs_swim_support INTEGER DEFAULT 0,
    status TEXT DEFAULT 'scheduled',
    override_note TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS callout (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL REFERENCES shift(id),
    original_staff_id INTEGER NOT NULL REFERENCES staff(id),
    replacement_staff_id INTEGER REFERENCES staff(id),
    called_out_at TEXT DEFAULT (datetime('now')),
    reason TEXT,
    resolved INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS shift_template (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES student(id),
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    shift_type TEXT DEFAULT 'regular',
    activity_type TEXT DEFAULT 'general',
    needs_swim_support INTEGER DEFAULT 0,
    notes TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS student_absence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES student(id),
    date TEXT NOT NULL,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(student_id, date)
  );

  CREATE TABLE IF NOT EXISTS staff_dedicated_role (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    role TEXT NOT NULL,
    label TEXT,
    day_of_week INTEGER,
    start_date TEXT,
    end_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS staff_student_preference (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    student_id INTEGER NOT NULL REFERENCES student(id),
    level TEXT NOT NULL DEFAULT 'preferred',
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(staff_id, student_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS staff_onboarding (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    student_id INTEGER NOT NULL REFERENCES student(id),
    current_day INTEGER NOT NULL DEFAULT 1,
    total_days INTEGER NOT NULL DEFAULT 3,
    scheduled_date TEXT,
    completed INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS student_group (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    staffing_ratio INTEGER NOT NULL DEFAULT 2,
    active INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS student_group_member (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES student_group(id),
    student_id INTEGER NOT NULL REFERENCES student(id),
    UNIQUE(group_id, student_id)
  );
`);

// Add group_id to student table if it doesn't exist
try {
  db.exec(`ALTER TABLE student ADD COLUMN group_id INTEGER REFERENCES student_group(id)`);
} catch {
  // Column already exists
}

// Add staffing_ratio column if it doesn't exist
try {
  db.exec(`ALTER TABLE student ADD COLUMN staffing_ratio INTEGER DEFAULT 1`);
} catch {
  // Column already exists
}

console.log("Database migrated successfully at", dbPath);
db.close();
