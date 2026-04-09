import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const resolved = searchParams.get("resolved");
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");

  const db = getDb(true);

  let query = `
    SELECT c.*, s.date, s.start_time, s.end_time, s.student_id,
           st.name as student_name, stf.name as original_staff_name,
           rstf.name as replacement_staff_name
    FROM callout c
    JOIN shift s ON c.shift_id = s.id
    JOIN student st ON s.student_id = st.id
    JOIN staff stf ON c.original_staff_id = stf.id
    LEFT JOIN staff rstf ON c.replacement_staff_id = rstf.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (resolved !== null) {
    query += " AND c.resolved = ?";
    params.push(resolved === "true" ? 1 : 0);
  }
  if (weekStart && weekEnd) {
    query += " AND s.date >= ? AND s.date <= ?";
    params.push(weekStart, weekEnd);
  }

  query += " ORDER BY c.called_out_at DESC";

  const callouts = db.prepare(query).all(...params);
  db.close();
  return NextResponse.json(callouts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  // Mark the shift as called out
  db.prepare(`
    UPDATE shift SET status = 'called_out', assigned_staff_id = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(body.shift_id);

  // Create callout record
  const result = db.prepare(`
    INSERT INTO callout (shift_id, original_staff_id, reason)
    VALUES (?, ?, ?)
  `).run(body.shift_id, body.original_staff_id, body.reason || null);

  const callout = db.prepare(`
    SELECT c.*, s.date, s.start_time, s.end_time,
           st.name as student_name, stf.name as original_staff_name
    FROM callout c
    JOIN shift s ON c.shift_id = s.id
    JOIN student st ON s.student_id = st.id
    JOIN staff stf ON c.original_staff_id = stf.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  db.close();
  return NextResponse.json(callout, { status: 201 });
}
