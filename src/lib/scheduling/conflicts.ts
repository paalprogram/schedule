import Database from "better-sqlite3";
import path from "path";
import type { ScheduleWarning } from "@/types";
import { MAX_SAME_STUDENT_PER_WEEK, MAX_SWIM_SHIFTS_PER_WEEK } from "./rules";

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

export function getOverlappingAssignments(
  staffId: number, date: string, startTime: string, endTime: string, excludeShiftId?: number
): Array<{ shiftId: number; studentId: number; studentName: string; startTime: string; endTime: string }> {
  const isOvernightShift = endTime <= startTime;
  const dateObj = new Date(date + "T00:00:00");
  const prevDate = new Date(dateObj);
  prevDate.setDate(dateObj.getDate() - 1);
  const nextDate = new Date(dateObj);
  nextDate.setDate(dateObj.getDate() + 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const datesToCheck = [fmt(prevDate), date, fmt(nextDate)];

  const db = getDb();
  const placeholders = datesToCheck.map(() => '?').join(',');
  const params: (string | number)[] = [staffId, ...datesToCheck];
  if (excludeShiftId) params.push(excludeShiftId);

  const shifts = db.prepare(`
    SELECT s.id, s.date, s.start_time, s.end_time, s.student_id, st.name as student_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    WHERE s.assigned_staff_id = ? AND s.date IN (${placeholders})
    AND s.status IN ('scheduled', 'covered')
    ${excludeShiftId ? 'AND s.id != ?' : ''}
  `).all(...params) as Array<{
    id: number; date: string; start_time: string; end_time: string;
    student_id: number; student_name: string;
  }>;
  db.close();

  const result: Array<{ shiftId: number; studentId: number; studentName: string; startTime: string; endTime: string }> = [];
  for (const s of shifts) {
    const existingIsOvernight = s.end_time <= s.start_time;
    let overlaps = false;

    if (s.date === date) {
      overlaps = timesOverlap(startTime, endTime, s.start_time, s.end_time);
    } else if (s.date === fmt(prevDate) && existingIsOvernight) {
      overlaps = timesOverlap(startTime, endTime, "00:00", s.end_time);
    } else if (s.date === fmt(nextDate) && isOvernightShift && !existingIsOvernight) {
      overlaps = timesOverlap("00:00", endTime, s.start_time, s.end_time);
    }

    if (overlaps) {
      result.push({
        shiftId: s.id,
        studentId: s.student_id,
        studentName: s.student_name,
        startTime: s.start_time,
        endTime: s.end_time,
      });
    }
  }
  return result;
}

export function isStudentAbsent(studentId: number, date: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM student_absence
    WHERE student_id = ? AND date = ?
  `).get(studentId, date) as { count: number };
  db.close();
  return result.count > 0;
}

export function hasStaffDedicatedRole(staffId: number, date: string): boolean {
  const dayOfWeek = new Date(date + "T00:00:00").getDay();
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM staff_dedicated_role
    WHERE staff_id = ?
    AND (day_of_week IS NULL OR day_of_week = ?)
    AND (start_date IS NULL OR start_date <= ?)
    AND (end_date IS NULL OR end_date >= ?)
  `).get(staffId, dayOfWeek, date, date) as { count: number };
  db.close();
  return result.count > 0;
}

export function getStaffStudentPreference(staffId: number, studentId: number): string | null {
  const db = getDb();
  const result = db.prepare(`
    SELECT level FROM staff_student_preference
    WHERE staff_id = ? AND student_id = ?
  `).get(staffId, studentId) as { level: string } | undefined;
  db.close();
  return result?.level ?? null;
}

export function getStaffOnboardingForDate(staffId: number, studentId: number, date: string): { currentDay: number; totalDays: number } | null {
  const db = getDb();
  const result = db.prepare(`
    SELECT current_day, total_days FROM staff_onboarding
    WHERE staff_id = ? AND student_id = ? AND completed = 0
    AND (scheduled_date IS NULL OR scheduled_date = ?)
  `).get(staffId, studentId, date) as { current_day: number; total_days: number } | undefined;
  db.close();
  if (!result) return null;
  return { currentDay: result.current_day, totalDays: result.total_days };
}

export function getActiveOnboardingForDate(date: string): Array<{
  staffId: number; studentId: number; currentDay: number; totalDays: number;
  staffName: string; studentName: string;
}> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT o.staff_id, o.student_id, o.current_day, o.total_days,
           s.name as staff_name, st.name as student_name
    FROM staff_onboarding o
    JOIN staff s ON o.staff_id = s.id
    JOIN student st ON o.student_id = st.id
    WHERE o.completed = 0
    AND (o.scheduled_date IS NULL OR o.scheduled_date = ?)
  `).all(date) as Array<{
    staff_id: number; student_id: number; current_day: number; total_days: number;
    staff_name: string; student_name: string;
  }>;
  db.close();
  return rows.map(r => ({
    staffId: r.staff_id,
    studentId: r.student_id,
    currentDay: r.current_day,
    totalDays: r.total_days,
    staffName: r.staff_name,
    studentName: r.student_name,
  }));
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

  // Check same-staff-same-student over limit
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
    HAVING count > ?
  `).all(weekStart, weekEnd, MAX_SAME_STUDENT_PER_WEEK) as Array<{
    assigned_staff_id: number; student_id: number; count: number;
    staff_name: string; student_name: string;
  }>;

  for (const p of pairCounts) {
    warnings.push({
      type: "over_twice",
      severity: "warning",
      message: `${p.staff_name} assigned to ${p.student_name} ${p.count} times this week (prefer \u2264${MAX_SAME_STUDENT_PER_WEEK})`,
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

  // Check swim-heavy staff
  const swimCounts = db.prepare(`
    SELECT assigned_staff_id, COUNT(*) as count, stf.name as staff_name
    FROM shift s
    JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.needs_swim_support = 1
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
    GROUP BY assigned_staff_id
    HAVING count > ?
  `).all(weekStart, weekEnd, MAX_SWIM_SHIFTS_PER_WEEK) as Array<{
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

  // Check shifts assigned to absent students
  const absentConflicts = db.prepare(`
    SELECT s.id, s.date, st.name as student_name, s.student_id
    FROM shift s
    JOIN student st ON s.student_id = st.id
    JOIN student_absence sa ON sa.student_id = s.student_id AND sa.date = s.date
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
  `).all(weekStart, weekEnd) as Array<{
    id: number; date: string; student_name: string; student_id: number;
  }>;

  for (const a of absentConflicts) {
    warnings.push({
      type: "student_absent",
      severity: "error",
      message: `${a.student_name} is absent on ${a.date} but has a scheduled shift`,
      shiftId: a.id,
      studentId: a.student_id,
    });
  }

  // Check staff with dedicated roles assigned to regular shifts
  const dedicatedConflicts = db.prepare(`
    SELECT s.id, s.date, stf.name as staff_name, st.name as student_name,
           dr.role as dedicated_role, dr.label as role_label, s.assigned_staff_id
    FROM shift s
    JOIN student st ON s.student_id = st.id
    JOIN staff stf ON s.assigned_staff_id = stf.id
    JOIN staff_dedicated_role dr ON dr.staff_id = s.assigned_staff_id
      AND (dr.day_of_week IS NULL OR dr.day_of_week = CAST(strftime('%w', s.date) AS INTEGER))
      AND (dr.start_date IS NULL OR dr.start_date <= s.date)
      AND (dr.end_date IS NULL OR dr.end_date >= s.date)
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
  `).all(weekStart, weekEnd) as Array<{
    id: number; date: string; staff_name: string; student_name: string;
    dedicated_role: string; role_label: string | null; assigned_staff_id: number;
  }>;

  for (const dc of dedicatedConflicts) {
    warnings.push({
      type: "dedicated_role_conflict",
      severity: "warning",
      message: `${dc.staff_name} has dedicated role (${dc.role_label || dc.dedicated_role}) but is assigned to ${dc.student_name} on ${dc.date}`,
      shiftId: dc.id,
      staffId: dc.assigned_staff_id,
    });
  }

  // Check onboarding sequence — staff in onboarding should be assigned to their training student
  const onboardingRows = db.prepare(`
    SELECT o.staff_id, o.student_id, o.current_day, o.total_days, o.scheduled_date,
           stf.name as staff_name, st.name as student_name
    FROM staff_onboarding o
    JOIN staff stf ON o.staff_id = stf.id
    JOIN student st ON o.student_id = st.id
    WHERE o.completed = 0
    AND o.scheduled_date >= ? AND o.scheduled_date <= ?
  `).all(weekStart, weekEnd) as Array<{
    staff_id: number; student_id: number; current_day: number; total_days: number;
    scheduled_date: string; staff_name: string; student_name: string;
  }>;

  for (const ob of onboardingRows) {
    // Check if staff is actually assigned to their onboarding student on that date
    const assigned = db.prepare(`
      SELECT COUNT(*) as count FROM shift
      WHERE assigned_staff_id = ? AND student_id = ? AND date = ?
      AND status IN ('scheduled', 'covered')
    `).get(ob.staff_id, ob.student_id, ob.scheduled_date) as { count: number };

    if (assigned.count === 0) {
      warnings.push({
        type: "onboarding_sequence_broken",
        severity: "warning",
        message: `${ob.staff_name} has onboarding Day ${ob.current_day}/${ob.total_days} with ${ob.student_name} on ${ob.scheduled_date} but is not assigned`,
        staffId: ob.staff_id,
        studentId: ob.student_id,
      });
    }
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
