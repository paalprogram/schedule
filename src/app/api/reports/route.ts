import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: "weekStart and weekEnd required" }, { status: 400 });
  }

  const db = getDb(true);

  // Staff-student pairing counts
  const pairingCounts = db.prepare(`
    SELECT s.assigned_staff_id, stf.name as staff_name,
           s.student_id, st.name as student_name,
           COUNT(*) as count
    FROM shift s
    JOIN staff stf ON s.assigned_staff_id = stf.id
    JOIN student st ON s.student_id = st.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
    GROUP BY s.assigned_staff_id, s.student_id
    ORDER BY stf.name, st.name
  `).all(weekStart, weekEnd);

  // Swim assignment counts
  const swimCounts = db.prepare(`
    SELECT s.assigned_staff_id, stf.name as staff_name, COUNT(*) as swim_count
    FROM shift s
    JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.needs_swim_support = 1
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
    GROUP BY s.assigned_staff_id
    ORDER BY swim_count DESC
  `).all(weekStart, weekEnd);

  // Total shifts per staff
  const staffLoadCounts = db.prepare(`
    SELECT s.assigned_staff_id, stf.name as staff_name, COUNT(*) as total_shifts,
           SUM(CASE WHEN s.shift_type = 'overnight' THEN 1 ELSE 0 END) as overnight_count
    FROM shift s
    JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
    GROUP BY s.assigned_staff_id
    ORDER BY total_shifts DESC
  `).all(weekStart, weekEnd);

  // Uncovered shifts
  const uncoveredShifts = db.prepare(`
    SELECT s.*, st.name as student_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    WHERE s.date >= ? AND s.date <= ?
    AND (s.status IN ('open', 'called_out') OR s.assigned_staff_id IS NULL)
    ORDER BY s.date, s.start_time
  `).all(weekStart, weekEnd);

  // Callout count
  const calloutCount = db.prepare(`
    SELECT COUNT(*) as count FROM callout c
    JOIN shift s ON c.shift_id = s.id
    WHERE s.date >= ? AND s.date <= ?
  `).get(weekStart, weekEnd) as { count: number };

  // Override count
  const overrideCount = db.prepare(`
    SELECT COUNT(*) as count FROM shift
    WHERE date >= ? AND date <= ?
    AND override_note IS NOT NULL AND override_note != ''
  `).get(weekStart, weekEnd) as { count: number };

  // Burnout risk analysis — per-staff metrics
  const allStaffShifts = db.prepare(`
    SELECT s.assigned_staff_id as staff_id, stf.name as staff_name,
           s.date, s.start_time, s.end_time, s.shift_type,
           s.student_id, st.name as student_name
    FROM shift s
    JOIN staff stf ON s.assigned_staff_id = stf.id
    JOIN student st ON s.student_id = st.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
    ORDER BY stf.name, s.date, s.start_time
  `).all(weekStart, weekEnd) as Array<{
    staff_id: number; staff_name: string; date: string;
    start_time: string; end_time: string; shift_type: string;
    student_id: number; student_name: string;
  }>;

  // Also count second_staff assignments
  const secondStaffShifts = db.prepare(`
    SELECT s.second_staff_id as staff_id, stf.name as staff_name,
           s.date, s.start_time, s.end_time, s.shift_type,
           s.student_id, st.name as student_name
    FROM shift s
    JOIN staff stf ON s.second_staff_id = stf.id
    JOIN student st ON s.student_id = st.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
    AND s.second_staff_id IS NOT NULL
    ORDER BY stf.name, s.date, s.start_time
  `).all(weekStart, weekEnd) as Array<{
    staff_id: number; staff_name: string; date: string;
    start_time: string; end_time: string; shift_type: string;
    student_id: number; student_name: string;
  }>;

  const combinedShifts = [...allStaffShifts, ...secondStaffShifts];

  // Group by staff
  const staffShiftMap = new Map<number, { name: string; shifts: typeof combinedShifts }>();
  for (const s of combinedShifts) {
    if (!staffShiftMap.has(s.staff_id)) staffShiftMap.set(s.staff_id, { name: s.staff_name, shifts: [] });
    staffShiftMap.get(s.staff_id)!.shifts.push(s);
  }

  function calcHours(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
    if (hours <= 0) hours += 24; // overnight
    return hours;
  }

  const burnoutRisks = Array.from(staffShiftMap.entries()).map(([staffId, data]) => {
    const shifts = data.shifts;
    const uniqueDates = [...new Set(shifts.map(s => s.date))].sort();

    // Total hours
    const totalHours = shifts.reduce((acc, s) => acc + calcHours(s.start_time, s.end_time), 0);

    // Consecutive days
    let maxConsecutive = 1;
    let currentStreak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prev = new Date(uniqueDates[i - 1] + "T00:00:00");
      const curr = new Date(uniqueDates[i] + "T00:00:00");
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        currentStreak++;
        if (currentStreak > maxConsecutive) maxConsecutive = currentStreak;
      } else {
        currentStreak = 1;
      }
    }

    // Same-student repetition (max times with any one student)
    const studentCounts = new Map<number, number>();
    for (const s of shifts) {
      studentCounts.set(s.student_id, (studentCounts.get(s.student_id) || 0) + 1);
    }
    const maxSameStudent = Math.max(...Array.from(studentCounts.values()), 0);
    const topStudent = [...studentCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    // Overnight count
    const overnightCount = shifts.filter(s => s.shift_type === "overnight").length;

    // Risk score (higher = more burnout risk)
    let riskScore = 0;
    if (totalHours > 40) riskScore += 3;
    else if (totalHours > 30) riskScore += 1;
    if (maxConsecutive >= 5) riskScore += 3;
    else if (maxConsecutive >= 4) riskScore += 2;
    else if (maxConsecutive >= 3) riskScore += 1;
    if (maxSameStudent >= 4) riskScore += 2;
    else if (maxSameStudent >= 3) riskScore += 1;
    if (overnightCount >= 3) riskScore += 2;
    else if (overnightCount >= 2) riskScore += 1;
    if (shifts.length > 8) riskScore += 2;
    else if (shifts.length > 6) riskScore += 1;

    const riskLevel: "low" | "moderate" | "high" =
      riskScore >= 6 ? "high" : riskScore >= 3 ? "moderate" : "low";

    return {
      staffId,
      staffName: data.name,
      totalShifts: shifts.length,
      totalHours: Math.round(totalHours * 10) / 10,
      daysWorked: uniqueDates.length,
      maxConsecutiveDays: maxConsecutive,
      overnightCount,
      maxSameStudent,
      topStudentName: topStudent ? [...staffShiftMap.get(staffId)!.shifts].find(s => s.student_id === topStudent[0])?.student_name || "" : "",
      topStudentCount: topStudent?.[1] || 0,
      riskScore,
      riskLevel,
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  db.close();

  return NextResponse.json({
    pairingCounts,
    swimCounts,
    staffLoadCounts,
    uncoveredShifts,
    calloutCount: calloutCount.count,
    overrideCount: overrideCount.count,
    burnoutRisks,
  });
}
