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

// Hard-delete a staff member.
//
// All staff-owned rows (availability, PTO, training, dedicated roles,
// preferences, onboarding, meeting attendance, and any callouts they're tied to)
// are removed. Shift assignments are preserved as records but the staff slot is
// nulled — if a shift loses its primary staff and had no second staff, it goes
// back to status='open'. Wrapped in a transaction so a failure mid-delete rolls
// back cleanly.
//
// Use the soft-archive flow on the staff detail page if you only want to mark
// someone inactive; this endpoint is permanent.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staffId = parseInt(id);
  if (!Number.isInteger(staffId) || staffId <= 0) {
    return NextResponse.json({ error: "Invalid staff ID" }, { status: 400 });
  }

  const db = getDb();
  const exists = db.prepare("SELECT id FROM staff WHERE id = ?").get(staffId);
  if (!exists) {
    db.close();
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  db.transaction(() => {
    // Free up shift slots that point to this staff.
    db.prepare(`
      UPDATE shift SET assigned_staff_id = NULL,
        status = CASE WHEN second_staff_id IS NULL THEN 'open' ELSE status END,
        updated_at = datetime('now')
      WHERE assigned_staff_id = ?
    `).run(staffId);
    db.prepare(`
      UPDATE shift SET second_staff_id = NULL, updated_at = datetime('now')
      WHERE second_staff_id = ?
    `).run(staffId);

    // Callouts: original_staff_id is NOT NULL so we can't preserve history without
    // the staff row. Drop them. replacement_staff_id refs in unrelated callouts
    // can be nulled.
    db.prepare("UPDATE callout SET replacement_staff_id = NULL WHERE replacement_staff_id = ?").run(staffId);
    db.prepare("DELETE FROM callout WHERE original_staff_id = ?").run(staffId);

    // Owned data — straightforward deletes.
    db.prepare("DELETE FROM staff_availability WHERE staff_id = ?").run(staffId);
    db.prepare("DELETE FROM staff_pto WHERE staff_id = ?").run(staffId);
    db.prepare("DELETE FROM staff_student_training WHERE staff_id = ?").run(staffId);
    db.prepare("DELETE FROM staff_dedicated_role WHERE staff_id = ?").run(staffId);
    db.prepare("DELETE FROM staff_student_preference WHERE staff_id = ?").run(staffId);
    db.prepare("DELETE FROM staff_onboarding WHERE staff_id = ?").run(staffId);
    db.prepare("DELETE FROM meeting_attendee WHERE staff_id = ?").run(staffId);

    db.prepare("DELETE FROM staff WHERE id = ?").run(staffId);
  })();

  db.close();
  return NextResponse.json({ deleted: true });
}
