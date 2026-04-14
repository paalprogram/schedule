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

  // Build dynamic SET clause — only update fields that are explicitly provided
  const sets: string[] = ["updated_at = datetime('now')"];
  const values: (string | number | null)[] = [];

  if ("assigned_staff_id" in body) {
    sets.push("assigned_staff_id = ?");
    values.push(body.assigned_staff_id ?? null);
  }
  if ("second_staff_id" in body) {
    sets.push("second_staff_id = ?");
    values.push(body.second_staff_id ?? null);
  }
  if ("status" in body || "assigned_staff_id" in body) {
    sets.push("status = ?");
    values.push(body.status || (body.assigned_staff_id ? "scheduled" : "open"));
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

  values.push(parseInt(id));
  db.prepare(`UPDATE shift SET ${sets.join(", ")} WHERE id = ?`).run(...values);

  // Cascade: remove staff from overlapping shifts when assigned here
  const staffId = body.assigned_staff_id ?? null;
  const secondStaffId = body.second_staff_id ?? null;
  const staffToCheck = [
    ...("assigned_staff_id" in body && staffId ? [staffId] : []),
    ...("second_staff_id" in body && secondStaffId ? [secondStaffId] : []),
  ] as number[];

  if (staffToCheck.length > 0) {
    const thisShift = db.prepare("SELECT date, start_time, end_time FROM shift WHERE id = ?")
      .get(parseInt(id)) as { date: string; start_time: string; end_time: string } | undefined;

    if (thisShift) {
      for (const sid of staffToCheck) {
        // Find other shifts on the same day where this staff is assigned
        const otherShifts = db.prepare(`
          SELECT id, start_time, end_time, assigned_staff_id, second_staff_id
          FROM shift
          WHERE date = ? AND id != ? AND status IN ('scheduled', 'covered', 'open')
          AND (assigned_staff_id = ? OR second_staff_id = ?)
        `).all(thisShift.date, parseInt(id), sid, sid) as Array<{
          id: number; start_time: string; end_time: string;
          assigned_staff_id: number | null; second_staff_id: number | null;
        }>;

        for (const other of otherShifts) {
          if (timesOverlap(thisShift.start_time, thisShift.end_time, other.start_time, other.end_time)) {
            // Remove this staff from the overlapping shift
            if (other.assigned_staff_id === sid) {
              db.prepare(`
                UPDATE shift SET assigned_staff_id = NULL, status = 'open', updated_at = datetime('now')
                WHERE id = ?
              `).run(other.id);
            } else if (other.second_staff_id === sid) {
              db.prepare(`
                UPDATE shift SET second_staff_id = NULL, updated_at = datetime('now')
                WHERE id = ?
              `).run(other.id);
            }
          }
        }
      }
    }
  }

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
