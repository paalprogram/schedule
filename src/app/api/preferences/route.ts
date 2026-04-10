import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validatePreferenceCreate } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staff_id");
  const studentId = searchParams.get("student_id");

  const db = getDb(true);
  let rows;

  if (staffId && studentId) {
    rows = db.prepare(`
      SELECT p.*, s.name as staff_name, st.name as student_name
      FROM staff_student_preference p
      JOIN staff s ON p.staff_id = s.id
      JOIN student st ON p.student_id = st.id
      WHERE p.staff_id = ? AND p.student_id = ?
    `).all(parseInt(staffId), parseInt(studentId));
  } else if (staffId) {
    rows = db.prepare(`
      SELECT p.*, s.name as staff_name, st.name as student_name
      FROM staff_student_preference p
      JOIN staff s ON p.staff_id = s.id
      JOIN student st ON p.student_id = st.id
      WHERE p.staff_id = ?
      ORDER BY st.name
    `).all(parseInt(staffId));
  } else if (studentId) {
    rows = db.prepare(`
      SELECT p.*, s.name as staff_name, st.name as student_name
      FROM staff_student_preference p
      JOIN staff s ON p.staff_id = s.id
      JOIN student st ON p.student_id = st.id
      WHERE p.student_id = ?
      ORDER BY s.name
    `).all(parseInt(studentId));
  } else {
    rows = db.prepare(`
      SELECT p.*, s.name as staff_name, st.name as student_name
      FROM staff_student_preference p
      JOIN staff s ON p.staff_id = s.id
      JOIN student st ON p.student_id = st.id
      ORDER BY s.name, st.name
    `).all();
  }

  db.close();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validationError = validatePreferenceCreate(body);
  if (validationError) return validationError;

  const db = getDb();
  try {
    // Upsert — update if the pair already exists
    const existing = db.prepare(`
      SELECT id FROM staff_student_preference WHERE staff_id = ? AND student_id = ?
    `).get(body.staff_id, body.student_id) as { id: number } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE staff_student_preference SET level = ?, reason = ? WHERE id = ?
      `).run(body.level, body.reason || null, existing.id);
      db.close();
      return NextResponse.json({ id: existing.id, updated: true });
    }

    const result = db.prepare(`
      INSERT INTO staff_student_preference (staff_id, student_id, level, reason)
      VALUES (?, ?, ?, ?)
    `).run(body.staff_id, body.student_id, body.level, body.reason || null);

    db.close();
    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
  } catch (e) {
    db.close();
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(`DELETE FROM staff_student_preference WHERE id = ?`).run(parseInt(id));
  db.close();

  if (result.changes === 0) {
    return NextResponse.json({ error: "Preference not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
