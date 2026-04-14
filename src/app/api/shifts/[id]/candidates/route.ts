import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { scoreCandidates } from "@/lib/scheduling/scorer";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(true);
  const shift = db.prepare("SELECT * FROM shift WHERE id = ?").get(id) as {
    id: number; student_id: number; date: string;
    start_time: string; end_time: string; shift_type: string;
    needs_swim_support: number;
    assigned_staff_id: number | null;
    second_staff_id: number | null;
  } | undefined;
  db.close();

  if (!shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 });

  const candidates = scoreCandidates({
    studentId: shift.student_id,
    date: shift.date,
    startTime: shift.start_time,
    endTime: shift.end_time,
    shiftType: shift.shift_type,
    needsSwimSupport: !!shift.needs_swim_support,
    excludeShiftId: shift.id,
    mode: "manual",
  });

  // Filter out staff already assigned to this shift
  const alreadyAssigned = new Set<number>();
  if (shift.assigned_staff_id) alreadyAssigned.add(shift.assigned_staff_id);
  if (shift.second_staff_id) alreadyAssigned.add(shift.second_staff_id);

  const filtered = candidates.filter(c => !alreadyAssigned.has(c.staffId));

  return NextResponse.json(filtered);
}
