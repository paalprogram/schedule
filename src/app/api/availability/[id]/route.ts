import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateAvailabilityUpdate } from "@/lib/validation";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const validationError = validateAvailabilityUpdate(body);
  if (validationError) return validationError;

  const db = getDb();

  db.prepare(`
    UPDATE staff_availability SET day_of_week = ?, start_time = ?, end_time = ?
    WHERE id = ?
  `).run(body.day_of_week, body.start_time, body.end_time, id);

  const avail = db.prepare("SELECT * FROM staff_availability WHERE id = ?").get(id);
  db.close();
  return NextResponse.json(avail);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM staff_availability WHERE id = ?").run(id);
  db.close();
  return NextResponse.json({ success: true });
}
