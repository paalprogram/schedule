import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateTemplateCreate } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");

  const db = getDb(true);
  let query = `
    SELECT t.*, s.name as student_name
    FROM shift_template t
    JOIN student s ON t.student_id = s.id
  `;
  const params: (string | number)[] = [];

  if (studentId) {
    query += " WHERE t.student_id = ?";
    params.push(parseInt(studentId));
  }

  query += " ORDER BY t.student_id, t.day_of_week, t.start_time";

  const templates = db.prepare(query).all(...params);
  db.close();
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validationError = validateTemplateCreate(body);
  if (validationError) return validationError;

  const db = getDb();

  const result = db.prepare(`
    INSERT INTO shift_template (student_id, day_of_week, start_time, end_time, shift_type, activity_type, needs_swim_support, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.student_id,
    body.day_of_week,
    body.start_time,
    body.end_time,
    body.shift_type || "regular",
    body.activity_type || "general",
    body.needs_swim_support ? 1 : 0,
    body.notes || null
  );

  const template = db.prepare("SELECT * FROM shift_template WHERE id = ?").get(result.lastInsertRowid);
  db.close();
  return NextResponse.json(template, { status: 201 });
}
