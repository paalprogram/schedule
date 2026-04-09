import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");
  const studentId = searchParams.get("studentId");
  const status = searchParams.get("status");

  const db = getDb(true);

  let query = `
    SELECT s.*, st.name as student_name, stf.name as staff_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (weekStart && weekEnd) {
    query += " AND s.date >= ? AND s.date <= ?";
    params.push(weekStart, weekEnd);
  }
  if (studentId) {
    query += " AND s.student_id = ?";
    params.push(parseInt(studentId));
  }
  if (status) {
    query += " AND s.status = ?";
    params.push(status);
  }

  query += " ORDER BY s.date, s.start_time, st.name";

  const shifts = db.prepare(query).all(...params);
  db.close();
  return NextResponse.json(shifts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, shift_type, activity_type, needs_swim_support, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.student_id,
    body.assigned_staff_id || null,
    body.date,
    body.start_time,
    body.end_time,
    body.shift_type || "regular",
    body.activity_type || "general",
    body.needs_swim_support ? 1 : 0,
    body.assigned_staff_id ? "scheduled" : "open",
    body.notes || null
  );

  const shift = db.prepare(`
    SELECT s.*, st.name as student_name, stf.name as staff_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.id = ?
  `).get(result.lastInsertRowid);

  db.close();
  return NextResponse.json(shift, { status: 201 });
}
