import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(true);
  const shift = db.prepare(`
    SELECT s.*, st.name as student_name, stf.name as staff_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.id = ?
  `).get(id);
  db.close();

  if (!shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  return NextResponse.json(shift);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  db.prepare(`
    UPDATE shift SET
      assigned_staff_id = ?,
      status = ?,
      override_note = COALESCE(?, override_note),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    body.assigned_staff_id ?? null,
    body.status || (body.assigned_staff_id ? "scheduled" : "open"),
    body.override_note ?? null,
    body.notes ?? null,
    id
  );

  const shift = db.prepare(`
    SELECT s.*, st.name as student_name, stf.name as staff_name
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
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
