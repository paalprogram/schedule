import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateStudentCreate } from "@/lib/validation";

export async function GET() {
  const db = getDb(true);
  const students = db.prepare(`
    SELECT s.*,
      (SELECT GROUP_CONCAT(staff_id) FROM staff_student_training WHERE student_id = s.id AND approved = 1) as trained_staff_ids
    FROM student s
    ORDER BY s.active DESC, s.name
  `).all();
  db.close();
  return NextResponse.json(students);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validationError = validateStudentCreate(body);
  if (validationError) return validationError;

  const db = getDb();

  const result = db.prepare(`
    INSERT INTO student (name, requires_swim_support, notes)
    VALUES (?, ?, ?)
  `).run(body.name, body.requires_swim_support ? 1 : 0, body.notes || null);

  // Insert training if provided
  if (body.trained_staff_ids && Array.isArray(body.trained_staff_ids)) {
    const insertTraining = db.prepare(`
      INSERT INTO staff_student_training (staff_id, student_id, approved, certified_date)
      VALUES (?, ?, 1, date('now'))
    `);
    for (const staffId of body.trained_staff_ids) {
      insertTraining.run(staffId, result.lastInsertRowid);
    }
  }

  const student = db.prepare("SELECT * FROM student WHERE id = ?").get(result.lastInsertRowid);
  db.close();
  return NextResponse.json(student, { status: 201 });
}
