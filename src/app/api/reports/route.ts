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

  db.close();

  return NextResponse.json({
    pairingCounts,
    swimCounts,
    staffLoadCounts,
    uncoveredShifts,
    calloutCount: calloutCount.count,
    overrideCount: overrideCount.count,
  });
}
