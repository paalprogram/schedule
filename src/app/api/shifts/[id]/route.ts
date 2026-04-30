import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateShiftUpdate } from "@/lib/validation";
import { timesOverlap } from "@/lib/scheduling/conflicts";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(true);
  const shift = db.prepare(`
    SELECT s.*, st.name as student_name, stf.name as staff_name, stf2.name as second_staff_name,
           st.staffing_ratio
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
    LEFT JOIN staff stf2 ON s.second_staff_id = stf2.id
    WHERE s.id = ?
  `).get(id);
  db.close();

  if (!shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  return NextResponse.json(shift);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const validationError = validateShiftUpdate(body);
  if (validationError) return validationError;

  const db = getDb();
  const shiftId = parseInt(id);

  const current = db.prepare(
    "SELECT assigned_staff_id, second_staff_id, status, date, start_time, end_time FROM shift WHERE id = ?"
  ).get(shiftId) as {
    assigned_staff_id: number | null; second_staff_id: number | null; status: string;
    date: string; start_time: string; end_time: string;
  } | undefined;

  if (!current) {
    db.close();
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }

  // Resolve post-update staff slots so we can tell what actually changed.
  // Status writes and the cascade-unassign sweep below MUST be gated on real
  // change — otherwise saving notes on a 'covered' shift would demote it back
  // to 'scheduled' and could yank the same staff off another overlapping shift.
  const primaryProvided = "assigned_staff_id" in body;
  const secondProvided = "second_staff_id" in body;
  const nextPrimary = primaryProvided ? (body.assigned_staff_id ?? null) : current.assigned_staff_id;
  const nextSecond = secondProvided ? (body.second_staff_id ?? null) : current.second_staff_id;
  const primaryChanged = primaryProvided && nextPrimary !== current.assigned_staff_id;
  const secondChanged = secondProvided && nextSecond !== current.second_staff_id;

  if (nextPrimary !== null && nextSecond !== null && nextPrimary === nextSecond) {
    db.close();
    return NextResponse.json(
      { error: "Validation failed", details: [{ field: "second_staff_id", message: "Second staff cannot be the same person as the primary staff" }] },
      { status: 400 }
    );
  }

  // Build dynamic SET clause — only update fields that are explicitly provided
  const sets: string[] = ["updated_at = datetime('now')"];
  const values: (string | number | null)[] = [];

  if (primaryProvided) {
    sets.push("assigned_staff_id = ?");
    values.push(nextPrimary);
  }
  if (secondProvided) {
    sets.push("second_staff_id = ?");
    values.push(nextSecond);
  }
  // Only touch status when the caller explicitly set one, or when the primary
  // staff actually changed (a true assign/unassign event).
  if ("status" in body) {
    sets.push("status = ?");
    values.push(body.status);
  } else if (primaryChanged) {
    sets.push("status = ?");
    values.push(nextPrimary ? "scheduled" : "open");
  }
  if ("override_note" in body) {
    sets.push("override_note = ?");
    values.push(body.override_note ?? null);
  }
  if ("notes" in body) {
    sets.push("notes = ?");
    values.push(body.notes ?? null);
  }
  if ("activity_type" in body) {
    sets.push("activity_type = ?");
    values.push(body.activity_type);
  }
  if ("start_time" in body) {
    sets.push("start_time = ?");
    values.push(body.start_time);
  }
  if ("end_time" in body) {
    sets.push("end_time = ?");
    values.push(body.end_time);
  }
  if ("shift_type" in body) {
    sets.push("shift_type = ?");
    values.push(body.shift_type);
  }
  if ("needs_swim_support" in body) {
    sets.push("needs_swim_support = ?");
    values.push(body.needs_swim_support ? 1 : 0);
  }

  // Cascade only for staff *newly placed* in their slot — not for unchanged values.
  const staffToCheck: number[] = [];
  if (primaryChanged && nextPrimary !== null) staffToCheck.push(nextPrimary);
  if (secondChanged && nextSecond !== null) staffToCheck.push(nextSecond);

  db.transaction(() => {
    values.push(shiftId);
    db.prepare(`UPDATE shift SET ${sets.join(", ")} WHERE id = ?`).run(...values);

    if (staffToCheck.length === 0) return;

    const findOthers = db.prepare(`
      SELECT id, start_time, end_time, assigned_staff_id, second_staff_id
      FROM shift
      WHERE date = ? AND id != ? AND status IN ('scheduled', 'covered', 'open')
      AND (assigned_staff_id = ? OR second_staff_id = ?)
    `);
    const clearPrimary = db.prepare(`
      UPDATE shift SET assigned_staff_id = NULL, status = 'open', updated_at = datetime('now')
      WHERE id = ?
    `);
    const clearSecond = db.prepare(`
      UPDATE shift SET second_staff_id = NULL, updated_at = datetime('now')
      WHERE id = ?
    `);

    for (const sid of staffToCheck) {
      const otherShifts = findOthers.all(current.date, shiftId, sid, sid) as Array<{
        id: number; start_time: string; end_time: string;
        assigned_staff_id: number | null; second_staff_id: number | null;
      }>;
      for (const other of otherShifts) {
        if (!timesOverlap(current.start_time, current.end_time, other.start_time, other.end_time)) continue;
        if (other.assigned_staff_id === sid) clearPrimary.run(other.id);
        else if (other.second_staff_id === sid) clearSecond.run(other.id);
      }
    }
  })();

  const shift = db.prepare(`
    SELECT s.*, st.name as student_name, stf.name as staff_name, stf2.name as second_staff_name,
           st.staffing_ratio
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
    LEFT JOIN staff stf2 ON s.second_staff_id = stf2.id
    WHERE s.id = ?
  `).get(shiftId);

  db.close();
  return NextResponse.json(shift);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM callout WHERE shift_id = ?").run(id);
  db.prepare("DELETE FROM shift WHERE id = ?").run(id);
  db.close();
  return NextResponse.json({ success: true });
}
