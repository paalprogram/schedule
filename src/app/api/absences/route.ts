import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateStudentAbsenceCreate } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");

  const db = getDb(true);
  let rows;

  if (studentId) {
    rows = db.prepare(`
      SELECT sa.*, st.name as student_name
      FROM student_absence sa
      JOIN student st ON sa.student_id = st.id
      WHERE sa.student_id = ?
      ORDER BY sa.date
    `).all(parseInt(studentId));
  } else if (weekStart && weekEnd) {
    rows = db.prepare(`
      SELECT sa.*, st.name as student_name
      FROM student_absence sa
      JOIN student st ON sa.student_id = st.id
      WHERE sa.date >= ? AND sa.date <= ?
      ORDER BY sa.date, st.name
    `).all(weekStart, weekEnd);
  } else {
    rows = db.prepare(`
      SELECT sa.*, st.name as student_name
      FROM student_absence sa
      JOIN student st ON sa.student_id = st.id
      ORDER BY sa.date DESC
      LIMIT 200
    `).all();
  }

  db.close();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validationError = validateStudentAbsenceCreate(body);
  if (validationError) return validationError;

  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO student_absence (student_id, date, reason)
      VALUES (?, ?, ?)
    `).run(body.student_id, body.date, body.reason || null);

    db.close();
    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
  } catch (e: unknown) {
    db.close();
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Absence already recorded for this student on this date" },
        { status: 409 }
      );
    }
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");
  const date = searchParams.get("date");

  if (!studentId || !date) {
    return NextResponse.json(
      { error: "student_id and date are required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const result = db.prepare(`
    DELETE FROM student_absence WHERE student_id = ? AND date = ?
  `).run(parseInt(studentId), date);
  db.close();

  if (result.changes === 0) {
    return NextResponse.json({ error: "Absence not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
