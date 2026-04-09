import Database from "better-sqlite3";
import path from "path";
import type { ScheduleWarning } from "@/types";

function getDb() {
  const dbPath = path.join(process.cwd(), "data", "schedule.db");
  const db = new Database(dbPath, { readonly: true });
  db.pragma("foreign_keys = ON");
  return db;
}

/** Split a time range into segments — overnight ranges become two segments split at midnight */
function timeSegments(start: string, end: string): [string, string][] {
  if (end > start) return [[start, end]];
  // Overnight: e.g. 22:00→04:00 becomes [22:00,24:00] + [00:00,04:00]
  return [[start, "24:00"], ["00:00", end]];
}

export function timesOverlap(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string
): boolean {
  const aSegs = timeSegments(aStart, aEnd);
  const bSegs = timeSegments(bStart, bEnd);
  return aSegs.some(a => bSegs.some(b => a[0] < b[1] && b[0] < a[1]));
}

export function getStaffShiftsForWeek(staffId: number, weekStart: string, weekEnd: string) {
  const db = getDb();
  const shifts = db.prepare(`
    SELECT * FROM shift
    WHERE assigned_staff_id = ?
    AND date >= ? AND date <= ?
    AND status IN ('scheduled', 'covered')
  `).all(staffId, weekStart, weekEnd);
  db.close();
  return shifts as Array<{
    id: number; student_id: number; date: string;
    start_time: string; end_time: string;
    shift_type: string; activity_type: string;
    needs_swim_support: number;
  }>;
}

export function getStaffStudentCountForWeek(
  staffId: number, studentId: number, weekStart: string, weekEnd: string
): number {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM shift
    WHERE assigned_staff_id = ? AND student_id = ?
    AND date >= ? AND date <= ?
    AND status IN ('scheduled', 'covered')
  `).get(staffId, studentId, weekStart, weekEnd) as { count: number };
  db.close();
  return result.count;
}

export function getStaffSwimCountForWeek(staffId: number, weekStart: string, weekEnd: string): number {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM shift
    WHERE assigned_staff_id = ?
    AND needs_swim_support = 1
    AND date >= ? AND date <= ?
    AND status IN ('scheduled', 'covered')
  `).get(staffId, weekStart, weekEnd) as { count: number };
  db.close();
  return result.count;
}

export function isStaffOnPto(staffId: number, date: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM staff_pto
    WHERE staff_id = ? AND start_date <= ? AND end_date >= ?
  `).get(staffId, date, date) as { count: number };
  db.close();
  return result.count > 0;
}

export function isStaffAvailable(staffId: number, dayOfWeek: number, startTime: string, endTime: string): boolean {
  const isOvernightShift = endTime <= startTime;
  const nextDay = (dayOfWeek + 1) % 7;

  const db = getDb();
  const slots = db.prepare(`
    SELECT day_of_week, start_time, end_time FROM staff_availability
    WHERE staff_id = ? AND day_of_week IN (?, ?)
  `).all(staffId, dayOfWeek, nextDay) as Array<{ day_of_week: number; start_time: string; end_time: string }>;
  db.close();

  if (slots.length === 0) return false;

  const todaySlots = slots.filter(s => s.day_of_week === dayOfWeek);
  const nextDaySlots = slots.filter(s => s.day_of_week === nextDay);

  if (!isOvernightShift) {
    // Regular shift: must be fully covered by a single slot on the same day
    return todaySlots.some(slot => {
      if (slot.end_time <= slot.start_time) {
        // Overnight availability: shift fits in the evening or morning portion
        return startTime >= slot.start_time || endTime <= slot.end_time;
      }
      return startTime >= slot.start_time && endTime <= slot.end_time;
    });
  }

  // Overnight shift (e.g. Sat 22:00 → Sun 06:00):
  // Evening portion (startTime→24:00) must be covered on dayOfWeek,
  // morning portion (00:00→endTime) must be covered on nextDay.
  const eveningCovered = todaySlots.some(slot => {
    if (slot.end_time <= slot.start_time) {
      // Overnight availability: evening portion is [slot.start_time→24:00]
      return startTime >= slot.start_time;
    }
    // Regular availability that extends to end of day
    return startTime >= slot.start_time && slot.end_time >= "24:00";
  });

  const morningCovered = nextDaySlots.some(slot => {
    if (slot.end_time <= slot.start_time) {
      // Overnight availability: morning portion is [00:00→slot.end_time]
      return endTime <= slot.end_time;
    }
    // Regular availability starting from beginning of day
    return slot.start_time <= "00:00" && endTime <= slot.end_time;
  });

  // Also allow a single overnight availability slot on dayOfWeek that spans both portions
  const singleSlotCovers = todaySlots.some(slot =>
    slot.end_time <= slot.start_time &&
    startTime >= slot.start_time &&
    endTime <= slot.end_time
  );

  return singleSlotCovers || (eveningCovered && morningCovered);
}

export function hasOverlappingShift(
  staffId: number, date: string, startTime: string, endTime: string, excludeShiftId?: number
): boolean {
  const isOvernightShift = endTime <= startTime;

  // Compute adjacent dates for cross-day overlap checks
  const dateObj = new Date(date + "T00:00:00");
  const prevDate = new Date(dateObj);
  prevDate.setDate(dateObj.getDate() - 1);
  const nextDate = new Date(dateObj);
  nextDate.setDate(dateObj.getDate() + 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  // Dates to query: always include the shift's date.
  // If overnight, also check the next day (morning portion may overlap).
  // Always check previous day too (an existing overnight shift from yesterday may overlap).
  const datesToCheck = [fmt(prevDate), date, fmt(nextDate)];

  const db = getDb();
  const placeholders = datesToCheck.map(() => '?').join(',');
  const params: (string | number)[] = [staffId, ...datesToCheck];
  if (excludeShiftId) params.push(excludeShiftId);

  const shifts = db.prepare(`
    SELECT id, date, start_time, end_time FROM shift
    WHERE assigned_staff_id = ? AND date IN (${placeholders})
    AND status IN ('scheduled', 'covered')
    ${excludeShiftId ? 'AND id != ?' : ''}
  `).all(...params) as Array<{
    id: number; date: string; start_time: string; end_time: string;
  }>;
  db.close();

  return shifts.some(s => {
    const existingIsOvernight = s.end_time <= s.start_time;

    if (s.date === date) {
      // Same day: direct time overlap check
      return timesOverlap(startTime, endTime, s.start_time, s.end_time);
    }

    if (s.date === fmt(prevDate) && existingIsOvernight) {
      // Yesterday's overnight shift — its morning portion [00:00, s.end_time] may overlap
      // with the evening portion of our shift on today
      return timesOverlap(startTime, endTime, "00:00", s.end_time);
    }

    if (s.date === fmt(nextDate) && isOvernightShift) {
      // Our overnight shift's morning portion [00:00, endTime] may overlap
      // with a shift on the next day
      if (existingIsOvernight) {
        // Both overnight: our morning vs their evening — no overlap on next day
        return false;
      }
      return timesOverlap("00:00", endTime, s.start_time, s.end_time);
    }

    return false;
  });
}

export function isStaffTrained(staffId: number, studentId: number): boolean {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM staff_student_training
    WHERE staff_id = ? AND student_id = ? AND approved = 1
  `).get(staffId, studentId) as { count: number };
  db.close();
  return result.count > 0;
}

export function detectWeekWarnings(weekStart: string, weekEnd: string): ScheduleWarning[] {
  const db = getDb();
  const warnings: ScheduleWarning[] = [];

  // Get all shifts for the week
  const shifts = db.prepare(`
    SELECT s.*, st.name as student_name, stf.name as staff_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
  `).all(weekStart, weekEnd) as Array<{
    id: number; student_id: number; assigned_staff_id: number | null;
    date: string; start_time: string; end_time: string;
    shift_type: string; activity_type: string; needs_swim_support: number;
    student_name: string; staff_name: string | null;
  }>;

  // Check uncovered shifts
  const openShifts = db.prepare(`
    SELECT s.*, st.name as student_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    WHERE s.date >= ? AND s.date <= ?
    AND (s.status IN ('open', 'called_out') OR s.assigned_staff_id IS NULL)
  `).all(weekStart, weekEnd) as Array<{
    id: number; student_id: number; date: string; student_name: string;
    start_time: string;
  }>;

  for (const s of openShifts) {
    warnings.push({
      type: "uncovered",
      severity: "error",
      message: `${s.student_name} has uncovered shift on ${s.date} at ${s.start_time}`,
      shiftId: s.id,
      studentId: s.student_id,
    });
  }

  // Check same-staff-same-student > 2x
  const pairCounts = db.prepare(`
    SELECT assigned_staff_id, student_id, COUNT(*) as count,
           stf.name as staff_name, st.name as student_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
    GROUP BY assigned_staff_id, student_id
    HAVING count > 2
  `).all(weekStart, weekEnd) as Array<{
    assigned_staff_id: number; student_id: number; count: number;
    staff_name: string; student_name: string;
  }>;

  for (const p of pairCounts) {
    warnings.push({
      type: "over_twice",
      severity: "warning",
      message: `${p.staff_name} assigned to ${p.student_name} ${p.count} times this week (prefer ≤2)`,
      staffId: p.assigned_staff_id,
      studentId: p.student_id,
    });
  }

  // Check untrained assignments
  const untrainedAssignments = db.prepare(`
    SELECT s.id, s.assigned_staff_id, s.student_id, s.date,
           stf.name as staff_name, st.name as student_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM staff_student_training t
      WHERE t.staff_id = s.assigned_staff_id
      AND t.student_id = s.student_id AND t.approved = 1
    )
  `).all(weekStart, weekEnd) as Array<{
    id: number; assigned_staff_id: number; student_id: number;
    date: string; staff_name: string; student_name: string;
  }>;

  for (const u of untrainedAssignments) {
    warnings.push({
      type: "untrained",
      severity: "error",
      message: `${u.staff_name} is not trained on ${u.student_name} (${u.date})`,
      shiftId: u.id,
      staffId: u.assigned_staff_id,
      studentId: u.student_id,
    });
  }

  // Check swim-heavy staff (more than 2 swim shifts in a week)
  const swimCounts = db.prepare(`
    SELECT assigned_staff_id, COUNT(*) as count, stf.name as staff_name
    FROM shift s
    JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.needs_swim_support = 1
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
    GROUP BY assigned_staff_id
    HAVING count > 2
  `).all(weekStart, weekEnd) as Array<{
    assigned_staff_id: number; count: number; staff_name: string;
  }>;

  for (const sc of swimCounts) {
    warnings.push({
      type: "swim_heavy",
      severity: "warning",
      message: `${sc.staff_name} has ${sc.count} swim assignments this week`,
      staffId: sc.assigned_staff_id,
    });
  }

  // Check PTO conflicts
  const ptoConflicts = db.prepare(`
    SELECT s.id, s.assigned_staff_id, s.date,
           stf.name as staff_name, st.name as student_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    JOIN staff stf ON s.assigned_staff_id = stf.id
    JOIN staff_pto p ON p.staff_id = s.assigned_staff_id
      AND s.date >= p.start_date AND s.date <= p.end_date
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
  `).all(weekStart, weekEnd) as Array<{
    id: number; assigned_staff_id: number; date: string;
    staff_name: string; student_name: string;
  }>;

  for (const pc of ptoConflicts) {
    warnings.push({
      type: "pto_conflict",
      severity: "error",
      message: `${pc.staff_name} is on PTO on ${pc.date} but assigned to ${pc.student_name}`,
      shiftId: pc.id,
      staffId: pc.assigned_staff_id,
    });
  }

  db.close();
  return warnings;
}
