import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateStaffUpdate } from "@/lib/validation";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(true);
  const staffMember = db.prepare("SELECT * FROM staff WHERE id = ?").get(id);
  if (!staffMember) {
    db.close();
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  const availability = db.prepare("SELECT * FROM staff_availability WHERE staff_id = ? ORDER BY day_of_week").all(id);
  const pto = db.prepare("SELECT * FROM staff_pto WHERE staff_id = ? ORDER BY start_date").all(id);
  const training = db.prepare(`
    SELECT t.*, s.name as student_name
    FROM staff_student_training t
    JOIN student s ON t.student_id = s.id
    WHERE t.staff_id = ? AND t.approved = 1
  `).all(id);

  db.close();
  return NextResponse.json({ ...staffMember, availability, pto, training });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const validationError = validateStaffUpdate(body);
  if (validationError) return validationError;

  const db = getDb();

  db.transaction(() => {
    db.prepare(`
      UPDATE staff SET name = ?, role = ?, active = ?, can_work_overnight = ?, can_cover_swim = ?,
      max_hours_per_week = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      body.name, body.role, body.active ? 1 : 0,
      body.can_work_overnight ? 1 : 0, body.can_cover_swim ? 1 : 0,
      body.max_hours_per_week || null, body.notes || null, id
    );

    if (body.availability && Array.isArray(body.availability)) {
      db.prepare("DELETE FROM staff_availability WHERE staff_id = ?").run(id);
      const insertAvail = db.prepare(`
        INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time)
        VALUES (?, ?, ?, ?)
      `);
      for (const a of body.availability) {
        insertAvail.run(id, a.day_of_week, a.start_time, a.end_time);
      }
    }

    if (body.pto && Array.isArray(body.pto)) {
      db.prepare("DELETE FROM staff_pto WHERE staff_id = ?").run(id);
      const insertPto = db.prepare(`
        INSERT INTO staff_pto (staff_id, start_date, end_date, reason)
        VALUES (?, ?, ?, ?)
      `);
      for (const p of body.pto) {
        insertPto.run(id, p.start_date, p.end_date, p.reason || null);
      }
    }
  })();

  const staff = db.prepare("SELECT * FROM staff WHERE id = ?").get(id);
  db.close();
  return NextResponse.json(staff);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  // Soft delete - mark inactive
  db.prepare("UPDATE staff SET active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  db.close();
  return NextResponse.json({ success: true });
}
