import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateStaffCreate } from "@/lib/validation";

export async function GET() {
  const db = getDb(true);
  const staffList = db.prepare(`
    SELECT s.*,
      (SELECT GROUP_CONCAT(student_id) FROM staff_student_training WHERE staff_id = s.id AND approved = 1) as trained_student_ids
    FROM staff s
    ORDER BY s.active DESC, s.name
  `).all();
  db.close();
  return NextResponse.json(staffList);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validationError = validateStaffCreate(body);
  if (validationError) return validationError;

  const db = getDb();

  const newId = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO staff (name, role, can_work_overnight, can_cover_swim, max_hours_per_week, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      body.name,
      body.role || "direct_care",
      body.can_work_overnight ? 1 : 0,
      body.can_cover_swim ? 1 : 0,
      body.max_hours_per_week || null,
      body.notes || null
    );

    if (body.availability && Array.isArray(body.availability)) {
      const insertAvail = db.prepare(`
        INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time)
        VALUES (?, ?, ?, ?)
      `);
      for (const a of body.availability) {
        insertAvail.run(result.lastInsertRowid, a.day_of_week, a.start_time, a.end_time);
      }
    }

    return result.lastInsertRowid;
  })();

  const staff = db.prepare("SELECT * FROM staff WHERE id = ?").get(newId);
  db.close();
  return NextResponse.json(staff, { status: 201 });
}
