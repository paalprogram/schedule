import { scoreCandidates } from "./scorer";
import { getDb as _getDb } from "@/lib/db-utils";
import { toDateString } from "@/lib/utils";
import { ASSIGN_THRESHOLDS } from "./rules";

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
    dates.push(toDateString(d));
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

  const insertShift = db.prepare(`
    INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, shift_type, activity_type, needs_swim_support, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const existsCheck = db.prepare(`
    SELECT COUNT(*) as count FROM shift
    WHERE student_id = ? AND date = ? AND start_time = ? AND end_time = ?
  `);

  const created = db.transaction(() => {
    let count = 0;
    for (const template of templates) {
      const targetDate = dates.find(d => new Date(d + "T00:00:00").getDay() === template.day_of_week);
      if (!targetDate) continue;

      if (absenceSet.has(`${template.student_id}:${targetDate}`)) continue;

      const existingCount = (existsCheck.get(
        template.student_id, targetDate, template.start_time, template.end_time
      ) as { count: number }).count;
      if (existingCount > 0) continue;

      insertShift.run(
        template.student_id, null, targetDate,
        template.start_time, template.end_time,
        template.shift_type, template.activity_type,
        template.needs_swim_support, "open",
        template.notes
      );
      count++;
    }
    return count;
  })();

  db.close();
  return { created };
}

export function autoAssignOpenShifts(weekStart: string, weekEnd: string) {
  const db = getDb();

  // Build student staffing ratio lookup
  const students = db.prepare(`
    SELECT s.id, s.staffing_ratio, s.group_id, sg.staffing_ratio as group_ratio
    FROM student s
    LEFT JOIN student_group sg ON s.group_id = sg.id
  `).all() as Array<{ id: number; staffing_ratio: number; group_id: number | null; group_ratio: number | null }>;
  const ratioMap = new Map(students.map(s => [s.id, s.group_ratio || s.staffing_ratio || 1]));

  // Pass 1: Assign primary staff to shifts with no assigned_staff_id
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

  // Reused write statements — scoring queries the shared read singleton, but
  // mutations flow through this single writable handle for the whole call.
  const updatePrimary = db.prepare(`
    UPDATE shift SET assigned_staff_id = ?, status = 'scheduled', updated_at = datetime('now')
    WHERE id = ?
  `);
  const updateSecond = db.prepare(`
    UPDATE shift SET second_staff_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

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

    const best = candidates.find(c => !c.excluded && c.totalScore >= ASSIGN_THRESHOLDS.AUTO);
    if (best) {
      updatePrimary.run(best.staffId, shift.id);
      assigned++;
    } else {
      failed++;
    }
  }

  // Pass 2: Assign second staff for 2:1 students
  const needsSecondStaff = db.prepare(`
    SELECT * FROM shift
    WHERE date >= ? AND date <= ?
    AND assigned_staff_id IS NOT NULL
    AND second_staff_id IS NULL
    AND status = 'scheduled'
    ORDER BY needs_swim_support DESC, shift_type DESC, date, start_time
  `).all(weekStart, weekEnd) as Array<{
    id: number; student_id: number; assigned_staff_id: number; date: string;
    start_time: string; end_time: string; shift_type: string;
    needs_swim_support: number;
  }>;

  for (const shift of needsSecondStaff) {
    const ratio = ratioMap.get(shift.student_id) || 1;
    if (ratio < 2) continue;

    const candidates = scoreCandidates({
      studentId: shift.student_id,
      date: shift.date,
      startTime: shift.start_time,
      endTime: shift.end_time,
      shiftType: shift.shift_type,
      needsSwimSupport: !!shift.needs_swim_support,
      excludeShiftId: shift.id,
    });

    const best = candidates.find(c => !c.excluded && c.totalScore >= ASSIGN_THRESHOLDS.AUTO && c.staffId !== shift.assigned_staff_id);
    if (best) {
      updateSecond.run(best.staffId, shift.id);
      assigned++;
    } else {
      failed++;
    }
  }

  db.close();
  return { assigned, failed, total: openShifts.length + needsSecondStaff.filter(s => (ratioMap.get(s.student_id) || 1) >= 2).length };
}
