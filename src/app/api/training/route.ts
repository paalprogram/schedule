import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";

export async function GET() {
  const db = getDb(true);
  const training = db.prepare(`
    SELECT t.*, s.name as staff_name, st.name as student_name
    FROM staff_student_training t
    JOIN staff s ON t.staff_id = s.id
    JOIN student st ON t.student_id = st.id
    WHERE t.approved = 1
    ORDER BY s.name, st.name
  `).all();
  db.close();
  return NextResponse.json(training);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  // Upsert training record
  db.prepare(`
    INSERT INTO staff_student_training (staff_id, student_id, approved, certified_date)
    VALUES (?, ?, 1, date('now'))
    ON CONFLICT(staff_id, student_id) DO UPDATE SET approved = 1
  `).run(body.staff_id, body.student_id);

  db.close();
  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staffId");
  const studentId = searchParams.get("studentId");

  if (!staffId || !studentId) {
    return NextResponse.json({ error: "staffId and studentId required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM staff_student_training WHERE staff_id = ? AND student_id = ?").run(staffId, studentId);
  db.close();
  return NextResponse.json({ success: true });
}
