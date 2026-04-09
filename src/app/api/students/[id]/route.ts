import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateStudentUpdate } from "@/lib/validation";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(true);
  const student = db.prepare("SELECT * FROM student WHERE id = ?").get(id);
  if (!student) {
    db.close();
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const trainedStaff = db.prepare(`
    SELECT t.*, s.name as staff_name, s.can_cover_swim, s.can_work_overnight
    FROM staff_student_training t
    JOIN staff s ON t.staff_id = s.id
    WHERE t.student_id = ? AND t.approved = 1
  `).all(id);

  const templates = db.prepare("SELECT * FROM shift_template WHERE student_id = ? ORDER BY day_of_week").all(id);

  db.close();
  return NextResponse.json({ ...student, trainedStaff, templates });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const validationError = validateStudentUpdate(body);
  if (validationError) return validationError;

  const db = getDb();

  db.prepare(`
    UPDATE student SET name = ?, active = ?, requires_swim_support = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(body.name, body.active ? 1 : 0, body.requires_swim_support ? 1 : 0, body.notes || null, id);

  // Update training if provided
  if (body.trained_staff_ids && Array.isArray(body.trained_staff_ids)) {
    db.prepare("DELETE FROM staff_student_training WHERE student_id = ?").run(id);
    const insertTraining = db.prepare(`
      INSERT INTO staff_student_training (staff_id, student_id, approved, certified_date)
      VALUES (?, ?, 1, date('now'))
    `);
    for (const staffId of body.trained_staff_ids) {
      insertTraining.run(staffId, id);
    }
  }

  const student = db.prepare("SELECT * FROM student WHERE id = ?").get(id);
  db.close();
  return NextResponse.json(student);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare("UPDATE student SET active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  db.close();
  return NextResponse.json({ success: true });
}
