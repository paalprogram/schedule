import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";

// POST /api/availability/bulk-clear — delete all availability for a staff member on a specific day
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { staff_id, day_of_week } = body;

  if (!staff_id || day_of_week === undefined || day_of_week === null) {
    return NextResponse.json({ error: "staff_id and day_of_week required" }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(
    "DELETE FROM staff_availability WHERE staff_id = ? AND day_of_week = ?"
  ).run(staff_id, day_of_week);
  db.close();

  return NextResponse.json({ deleted: result.changes });
}
