import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  db.prepare(`
    UPDATE shift_template SET
      day_of_week = ?, start_time = ?, end_time = ?,
      shift_type = ?, activity_type = ?, needs_swim_support = ?, notes = ?
    WHERE id = ?
  `).run(
    body.day_of_week, body.start_time, body.end_time,
    body.shift_type || "regular", body.activity_type || "general",
    body.needs_swim_support ? 1 : 0, body.notes || null, id
  );

  const template = db.prepare("SELECT * FROM shift_template WHERE id = ?").get(id);
  db.close();
  return NextResponse.json(template);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM shift_template WHERE id = ?").run(id);
  db.close();
  return NextResponse.json({ success: true });
}
