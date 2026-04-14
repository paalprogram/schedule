import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";

// POST /api/shifts/bulk-delete — preview or execute bulk deletion
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { shiftIds, preview } = body as { shiftIds: number[]; preview?: boolean };

  if (!Array.isArray(shiftIds) || shiftIds.length === 0) {
    return NextResponse.json({ error: "shiftIds array required" }, { status: 400 });
  }

  if (shiftIds.length > 500) {
    return NextResponse.json({ error: "Maximum 500 shifts per bulk delete" }, { status: 400 });
  }

  const db = getDb(preview);
  const placeholders = shiftIds.map(() => "?").join(",");

  if (preview) {
    // Return the shifts that would be deleted
    const shifts = db.prepare(`
      SELECT s.id, s.date, s.start_time, s.end_time, s.status,
             st.name as student_name, stf.name as staff_name, stf2.name as second_staff_name
      FROM shift s
      JOIN student st ON s.student_id = st.id
      LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
      LEFT JOIN staff stf2 ON s.second_staff_id = stf2.id
      WHERE s.id IN (${placeholders})
      ORDER BY s.date, s.start_time, st.name
    `).all(...shiftIds);
    db.close();
    return NextResponse.json({ count: shifts.length, shifts });
  }

  // Execute deletion
  db.prepare(`DELETE FROM callout WHERE shift_id IN (${placeholders})`).run(...shiftIds);
  const result = db.prepare(`DELETE FROM shift WHERE id IN (${placeholders})`).run(...shiftIds);
  db.close();

  return NextResponse.json({ deleted: result.changes });
}
