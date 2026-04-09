import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time)
    VALUES (?, ?, ?, ?)
  `).run(body.staff_id, body.day_of_week, body.start_time, body.end_time);

  const avail = db.prepare("SELECT * FROM staff_availability WHERE id = ?").get(result.lastInsertRowid);
  db.close();
  return NextResponse.json(avail, { status: 201 });
}
