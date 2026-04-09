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
  const shifts = db.prepare(`
    SELECT s.date, s.start_time, s.end_time, s.shift_type, s.activity_type,
           s.status, st.name as student_name, stf.name as staff_name,
           s.needs_swim_support, s.override_note, s.notes
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.date, s.start_time, st.name
  `).all(weekStart, weekEnd) as Array<Record<string, unknown>>;
  db.close();

  const headers = ["Date", "Start Time", "End Time", "Student", "Staff", "Shift Type", "Activity", "Swim Support", "Status", "Override Note", "Notes"];
  const rows = shifts.map(s => [
    s.date, s.start_time, s.end_time, s.student_name, s.staff_name || "UNCOVERED",
    s.shift_type, s.activity_type, s.needs_swim_support ? "Yes" : "No",
    s.status, s.override_note || "", s.notes || "",
  ]);

  const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="schedule_${weekStart}_${weekEnd}.csv"`,
    },
  });
}
