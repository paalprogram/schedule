import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { detectWeekWarnings } from "@/lib/scheduling/conflicts";
import { validateDateRange } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");

  const dateError = validateDateRange(weekStart, weekEnd);
  if (dateError) return dateError;

  const db = getDb(true);
  const shifts = db.prepare(`
    SELECT s.*, st.name as student_name, stf.name as staff_name,
           stf2.name as second_staff_name,
           st.group_id as student_group_id,
           st.staffing_ratio,
           sg.name as group_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
    LEFT JOIN staff stf2 ON s.second_staff_id = stf2.id
    LEFT JOIN student_group sg ON st.group_id = sg.id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.date, s.start_time, st.name
  `).all(weekStart!, weekEnd!);

  // Load active onboarding assignments for the week to annotate shifts
  const onboardingRows = db.prepare(`
    SELECT o.staff_id, o.student_id, o.current_day, o.total_days, o.scheduled_date
    FROM staff_onboarding o
    WHERE o.completed = 0
    AND (o.scheduled_date IS NULL OR (o.scheduled_date >= ? AND o.scheduled_date <= ?))
  `).all(weekStart!, weekEnd!) as Array<{
    staff_id: number; student_id: number; current_day: number; total_days: number; scheduled_date: string | null;
  }>;

  db.close();

  // Build a lookup: "staffId:studentId:date" -> onboarding info
  const onboardingLookup = new Map<string, { currentDay: number; totalDays: number }>();
  for (const ob of onboardingRows) {
    if (ob.scheduled_date) {
      onboardingLookup.set(`${ob.staff_id}:${ob.student_id}:${ob.scheduled_date}`, {
        currentDay: ob.current_day,
        totalDays: ob.total_days,
      });
    }
  }

  // Load meetings for the week
  const meetingDb = getDb(true);
  const meetingsRaw = meetingDb.prepare(`
    SELECT m.*, GROUP_CONCAT(s.name) as attendee_names, GROUP_CONCAT(ma.staff_id) as attendee_ids
    FROM meeting m
    LEFT JOIN meeting_attendee ma ON ma.meeting_id = m.id
    LEFT JOIN staff s ON ma.staff_id = s.id
    WHERE m.date >= ? AND m.date <= ?
    GROUP BY m.id
    ORDER BY m.date, m.start_time
  `).all(weekStart!, weekEnd!) as Array<Record<string, unknown>>;
  meetingDb.close();

  // Group meetings by date
  const meetingsByDate: Record<string, Array<Record<string, unknown>>> = {};
  for (const m of meetingsRaw) {
    const date = m.date as string;
    if (!meetingsByDate[date]) meetingsByDate[date] = [];
    meetingsByDate[date].push({
      id: m.id,
      title: m.title,
      meetingType: m.meeting_type,
      startTime: m.start_time,
      endTime: m.end_time,
      location: m.location,
      notes: m.notes,
      attendeeNames: m.attendee_names ? (m.attendee_names as string).split(",") : [],
      attendeeIds: m.attendee_ids ? (m.attendee_ids as string).split(",").map(Number) : [],
    });
  }

  // Load student absences for the week
  const absenceDb = getDb(true);
  const absences = absenceDb.prepare(`
    SELECT student_id, date FROM student_absence
    WHERE date >= ? AND date <= ?
  `).all(weekStart!, weekEnd!) as Array<{ student_id: number; date: string }>;
  absenceDb.close();

  const absenceSet = new Set(absences.map(a => `${a.student_id}:${a.date}`));

  const warnings = detectWeekWarnings(weekStart!, weekEnd!);

  // Group shifts by date
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dateSet = new Set<string>();
  const d = new Date(weekStart! + "T00:00:00");
  const end = new Date(weekEnd! + "T00:00:00");
  while (d <= end) {
    dateSet.add(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }

  const days = Array.from(dateSet).map(date => ({
    date,
    dayName: dayNames[new Date(date + "T00:00:00").getDay()],
    shifts: (shifts as Array<Record<string, unknown>>).filter((s) => s.date === date).map(s => {
      const obKey = `${s.assigned_staff_id}:${s.student_id}:${s.date}`;
      const ob = s.assigned_staff_id ? onboardingLookup.get(obKey) : undefined;
      return {
        ...s,
        studentAbsent: absenceSet.has(`${s.student_id}:${s.date}`),
        onboardingDay: ob?.currentDay ?? null,
        onboardingTotalDays: ob?.totalDays ?? null,
      };
    }),
  }));

  // Build a list of absent students per date for the UI
  const absencesByDate: Record<string, number[]> = {};
  for (const a of absences) {
    if (!absencesByDate[a.date]) absencesByDate[a.date] = [];
    absencesByDate[a.date].push(a.student_id);
  }

  // Compute unassigned available staff per day
  const staffDb = getDb(true);
  const activeStaff = staffDb.prepare(
    "SELECT id, name FROM staff WHERE active = 1 ORDER BY name"
  ).all() as Array<{ id: number; name: string }>;

  const allAvailability = staffDb.prepare(`
    SELECT staff_id, day_of_week FROM staff_availability
  `).all() as Array<{ staff_id: number; day_of_week: number }>;

  const allPto = staffDb.prepare(`
    SELECT staff_id, start_date, end_date FROM staff_pto
    WHERE start_date <= ? AND end_date >= ?
  `).all(weekEnd!, weekStart!) as Array<{ staff_id: number; start_date: string; end_date: string }>;

  const allDedicatedRoles = staffDb.prepare(`
    SELECT staff_id, day_of_week, start_date, end_date FROM staff_dedicated_role
  `).all() as Array<{ staff_id: number; day_of_week: number | null; start_date: string | null; end_date: string | null }>;

  staffDb.close();

  // Build lookup: staffId -> Set of available day_of_week values
  const availByStaff = new Map<number, Set<number>>();
  for (const a of allAvailability) {
    if (!availByStaff.has(a.staff_id)) availByStaff.set(a.staff_id, new Set());
    availByStaff.get(a.staff_id)!.add(a.day_of_week);
  }

  // Build assigned staff set per date (both primary and second)
  const assignedByDate = new Map<string, Set<number>>();
  for (const s of shifts as Array<Record<string, unknown>>) {
    const date = s.date as string;
    if (!assignedByDate.has(date)) assignedByDate.set(date, new Set());
    const set = assignedByDate.get(date)!;
    if (s.assigned_staff_id) set.add(s.assigned_staff_id as number);
    if (s.second_staff_id) set.add(s.second_staff_id as number);
  }

  const unassignedByDate: Record<string, Array<{ id: number; name: string }>> = {};
  for (const date of dateSet) {
    const dayOfWeek = new Date(date + "T00:00:00").getDay();
    const assignedSet = assignedByDate.get(date) || new Set();

    unassignedByDate[date] = activeStaff.filter(s => {
      // Must have availability for this day
      const avail = availByStaff.get(s.id);
      if (!avail || !avail.has(dayOfWeek)) return false;

      // Must not be on PTO
      if (allPto.some(p => p.staff_id === s.id && p.start_date <= date && p.end_date >= date)) return false;

      // Must not have a dedicated role on this day
      if (allDedicatedRoles.some(dr =>
        dr.staff_id === s.id &&
        (dr.day_of_week === null || dr.day_of_week === dayOfWeek) &&
        (dr.start_date === null || dr.start_date <= date) &&
        (dr.end_date === null || dr.end_date >= date)
      )) return false;

      // Must not already be assigned to any shift
      if (assignedSet.has(s.id)) return false;

      return true;
    }).map(s => ({ id: s.id, name: s.name }));
  }

  return NextResponse.json({
    weekStart,
    weekEnd,
    days,
    warnings,
    absences: absencesByDate,
    meetings: meetingsByDate,
    unassignedStaff: unassignedByDate,
  });
}
