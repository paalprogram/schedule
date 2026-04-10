import Database from "better-sqlite3";
import path from "path";
import { scoreCandidates } from "./scorer";
import { getDb as _getDb, getDbPath } from "@/lib/db-utils";

function getDb() {
  return _getDb(false);
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

  // Load student absences for the week
  const absenceRows = db.prepare(`
    SELECT student_id, date FROM student_absence
    WHERE date >= ? AND date <= ?
  `).all(dates[0], dates[dates.length - 1]) as Array<{ student_id: number; date: string }>;
  const absenceSet = new Set(absenceRows.map(a => `${a.student_id}:${a.date}`));

  // Get all templates
  const templates = db.prepare(`SELECT * FROM shift_template`).all() as Array<{
    id: number; student_id: number; day_of_week: number;
    start_time: string; end_time: string; shift_type: string;
    activity_type: string; needs_swim_support: number; notes: string | null;
  }>;

  // Build student staffing ratio lookup — group ratio overrides individual ratio
  const students = db.prepare(`
    SELECT s.id, s.staffing_ratio, s.group_id, sg.staffing_ratio as group_ratio
    FROM student s
    LEFT JOIN student_group sg ON s.group_id = sg.id
  `).all() as Array<{ id: number; staffing_ratio: number; group_id: number | null; group_ratio: number | null }>;
  const ratioMap = new Map(students.map(s => [s.id, s.group_ratio || s.staffing_ratio || 1]));

  const insertShift = db.prepare(`
    INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, shift_type, activity_type, needs_swim_support, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let created = 0;

  for (const template of templates) {
    // Find the date for this day_of_week in the week
    const targetDate = dates.find(d => new Date(d + "T00:00:00").getDay() === template.day_of_week);
    if (!targetDate) continue;

    // Skip if student is absent on this date
    if (absenceSet.has(`${template.student_id}:${targetDate}`)) continue;

    // Check how many shifts already exist for this slot
    const existingCount = (db.prepare(`
      SELECT COUNT(*) as count FROM shift
      WHERE student_id = ? AND date = ? AND start_time = ? AND end_time = ?
    `).get(template.student_id, targetDate, template.start_time, template.end_time) as { count: number }).count;

    // Create enough shifts to reach the staffing ratio
    const ratio = ratioMap.get(template.student_id) || 1;
    const slotsNeeded = Math.max(0, ratio - existingCount);

    for (let slot = 0; slot < slotsNeeded; slot++) {
      insertShift.run(
        template.student_id, null, targetDate,
        template.start_time, template.end_time,
        template.shift_type, template.activity_type,
        template.needs_swim_support, "open",
        template.notes
      );
      created++;
    }
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
      const writeDb = new Database(getDbPath());
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
