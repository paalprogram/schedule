import Database from "better-sqlite3";
import path from "path";
import { scoreCandidates } from "./scorer";

function getDb() {
  const dbPath = path.join(process.cwd(), "data", "schedule.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}

export function generateWeekFromTemplates(weekStartDate: string) {
  const db = getDb();

  const startDate = new Date(weekStartDate + "T00:00:00");
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }

  // Get all templates
  const templates = db.prepare(`SELECT * FROM shift_template`).all() as Array<{
    id: number; student_id: number; day_of_week: number;
    start_time: string; end_time: string; shift_type: string;
    activity_type: string; needs_swim_support: number; notes: string | null;
  }>;

  const insertShift = db.prepare(`
    INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, shift_type, activity_type, needs_swim_support, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let created = 0;

  for (const template of templates) {
    // Find the date for this day_of_week in the week
    const targetDate = dates.find(d => new Date(d + "T00:00:00").getDay() === template.day_of_week);
    if (!targetDate) continue;

    // Check if shift already exists
    const existing = db.prepare(`
      SELECT id FROM shift
      WHERE student_id = ? AND date = ? AND start_time = ? AND end_time = ?
    `).get(template.student_id, targetDate, template.start_time, template.end_time);

    if (existing) continue;

    // Create shift as open, then try to auto-assign
    insertShift.run(
      template.student_id, null, targetDate,
      template.start_time, template.end_time,
      template.shift_type, template.activity_type,
      template.needs_swim_support, "open",
      template.notes
    );
    created++;
  }

  db.close();
  return { created };
}

export function autoAssignOpenShifts(weekStart: string, weekEnd: string) {
  const db = getDb();

  const openShifts = db.prepare(`
    SELECT * FROM shift
    WHERE date >= ? AND date <= ?
    AND (status = 'open' OR assigned_staff_id IS NULL)
    ORDER BY needs_swim_support DESC, shift_type DESC, date, start_time
  `).all(weekStart, weekEnd) as Array<{
    id: number; student_id: number; date: string;
    start_time: string; end_time: string; shift_type: string;
    needs_swim_support: number;
  }>;

  db.close();

  let assigned = 0;
  let failed = 0;

  for (const shift of openShifts) {
    const candidates = scoreCandidates({
      studentId: shift.student_id,
      date: shift.date,
      startTime: shift.start_time,
      endTime: shift.end_time,
      shiftType: shift.shift_type,
      needsSwimSupport: !!shift.needs_swim_support,
      excludeShiftId: shift.id,
    });

    const best = candidates.find(c => !c.excluded && c.totalScore >= 30);
    if (best) {
      const writeDb = new Database(path.join(process.cwd(), "data", "schedule.db"));
      writeDb.prepare(`
        UPDATE shift SET assigned_staff_id = ?, status = 'scheduled', updated_at = datetime('now')
        WHERE id = ?
      `).run(best.staffId, shift.id);
      writeDb.close();
      assigned++;
    } else {
      failed++;
    }
  }

  return { assigned, failed, total: openShifts.length };
}
