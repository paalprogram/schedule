import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { scoreCandidates } from "@/lib/scheduling/scorer";

/**
 * POST /api/staff-out
 *
 * Mark a staff member as OUT for a specific date.
 * This will:
 *   1. Create a PTO record for that day
 *   2. Find all their shifts on that date
 *   3. Create callout records for each shift
 *   4. Unassign the staff from those shifts (status → called_out)
 *   5. Optionally auto-reassign each affected shift to the best available candidate
 *
 * Body: { staff_id: number, date: string, reason?: string, auto_reassign?: boolean }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { staff_id, date, reason, auto_reassign } = body;

  if (!staff_id || !date) {
    return NextResponse.json({ error: "staff_id and date are required" }, { status: 400 });
  }

  const db = getDb();

  // 1. Get staff name for messaging
  const staff = db.prepare("SELECT id, name FROM staff WHERE id = ?").get(staff_id) as { id: number; name: string } | undefined;
  if (!staff) {
    db.close();
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  // 2. Create PTO record (check for existing first to avoid duplicate)
  const existingPto = db.prepare(
    "SELECT id FROM staff_pto WHERE staff_id = ? AND start_date <= ? AND end_date >= ?"
  ).get(staff_id, date, date);

  let ptoId: number | null = null;
  if (!existingPto) {
    const ptoResult = db.prepare(
      "INSERT INTO staff_pto (staff_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)"
    ).run(staff_id, date, date, reason || "Called out");
    ptoId = ptoResult.lastInsertRowid as number;
  }

  // 3. Find all their scheduled shifts on that date
  const affectedShifts = db.prepare(`
    SELECT s.id, s.student_id, s.start_time, s.end_time, s.shift_type,
           s.needs_swim_support, st.name as student_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    WHERE s.assigned_staff_id = ? AND s.date = ?
    AND s.status IN ('scheduled', 'covered')
  `).all(staff_id, date) as Array<{
    id: number; student_id: number; start_time: string; end_time: string;
    shift_type: string; needs_swim_support: number; student_name: string;
  }>;

  // 4. Create callout records and unassign
  const insertCallout = db.prepare(
    "INSERT INTO callout (shift_id, original_staff_id, reason) VALUES (?, ?, ?)"
  );
  const unassignShift = db.prepare(
    "UPDATE shift SET assigned_staff_id = NULL, status = 'called_out', updated_at = datetime('now') WHERE id = ?"
  );

  for (const shift of affectedShifts) {
    insertCallout.run(shift.id, staff_id, reason || "Called out");
    unassignShift.run(shift.id);
  }

  db.close();

  // 5. Auto-reassign if requested
  let reassigned = 0;
  let reassignFailed = 0;
  const reassignDetails: Array<{ student: string; newStaff: string | null }> = [];

  if (auto_reassign !== false && affectedShifts.length > 0) {
    for (const shift of affectedShifts) {
      const candidates = scoreCandidates({
        studentId: shift.student_id,
        date,
        startTime: shift.start_time,
        endTime: shift.end_time,
        shiftType: shift.shift_type,
        needsSwimSupport: !!shift.needs_swim_support,
        excludeShiftId: shift.id,
      });

      const best = candidates.find(c => !c.excluded && c.totalScore >= 30);
      if (best) {
        const writeDb = getDb();
        writeDb.prepare(
          "UPDATE shift SET assigned_staff_id = ?, status = 'covered', updated_at = datetime('now') WHERE id = ?"
        ).run(best.staffId, shift.id);
        // Mark the callout as resolved
        writeDb.prepare(
          "UPDATE callout SET replacement_staff_id = ?, resolved = 1 WHERE shift_id = ? AND original_staff_id = ? AND resolved = 0"
        ).run(best.staffId, shift.id, staff_id);
        writeDb.close();
        reassigned++;
        reassignDetails.push({ student: shift.student_name, newStaff: best.staffName });
      } else {
        reassignFailed++;
        reassignDetails.push({ student: shift.student_name, newStaff: null });
      }
    }
  }

  return NextResponse.json({
    staffName: staff.name,
    date,
    ptoCreated: !!ptoId,
    shiftsAffected: affectedShifts.length,
    reassigned,
    reassignFailed,
    details: reassignDetails,
  });
}

/**
 * DELETE /api/staff-out?staff_id=&date=
 *
 * Undo a staff-out: remove the PTO for that date.
 * Does NOT automatically re-assign the staff to shifts (that's a manual action).
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staff_id");
  const date = searchParams.get("date");

  if (!staffId || !date) {
    return NextResponse.json({ error: "staff_id and date are required" }, { status: 400 });
  }

  const db = getDb();
  // Remove single-day PTO records that match exactly
  const result = db.prepare(
    "DELETE FROM staff_pto WHERE staff_id = ? AND start_date = ? AND end_date = ?"
  ).run(parseInt(staffId), date, date);
  db.close();

  return NextResponse.json({ deleted: result.changes > 0 });
}
