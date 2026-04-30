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

  // day_of_week may be a number (single template) or an array of numbers
  // (one indefinite/standard schedule that recurs on multiple days). The
  // multi-day form lets you set a "9-3 every weekday" template in one form
  // submission instead of creating five separate rows by hand.
  const days: number[] = Array.isArray(body.day_of_week) ? body.day_of_week : [body.day_of_week];

  const insert = db.prepare(`
    INSERT INTO shift_template (student_id, day_of_week, start_time, end_time, shift_type, activity_type, needs_swim_support, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertedIds = db.transaction(() => {
    const ids: (number | bigint)[] = [];
    for (const day of days) {
      const result = insert.run(
        body.student_id,
        day,
        body.start_time,
        body.end_time,
        body.shift_type || "regular",
        body.activity_type || "general",
        body.needs_swim_support ? 1 : 0,
        body.notes || null
      );
      ids.push(result.lastInsertRowid);
    }
    return ids;
  })();

  const placeholders = insertedIds.map(() => "?").join(",");
  const templates = db.prepare(`SELECT * FROM shift_template WHERE id IN (${placeholders}) ORDER BY day_of_week`).all(...insertedIds);
  db.close();
  // Return single object for single-day creates (backwards compatible) or an
  // array when multiple days were created.
  return NextResponse.json(templates.length === 1 ? templates[0] : templates, { status: 201 });
}
