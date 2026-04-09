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
    SELECT s.*, st.name as student_name, stf.name as staff_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.date, s.start_time, st.name
  `).all(weekStart!, weekEnd!);
  db.close();

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
    shifts: (shifts as Array<Record<string, unknown>>).filter((s) => s.date === date),
  }));

  return NextResponse.json({
    weekStart,
    weekEnd,
    days,
    warnings,
  });
}
