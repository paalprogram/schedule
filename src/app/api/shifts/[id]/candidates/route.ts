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
  });

  return NextResponse.json(candidates);
}
