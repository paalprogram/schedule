import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateDedicatedRoleCreate } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staff_id");
  const date = searchParams.get("date");

  const db = getDb(true);
  let rows;

  if (staffId) {
    rows = db.prepare(`
      SELECT dr.*, s.name as staff_name
      FROM staff_dedicated_role dr
      JOIN staff s ON dr.staff_id = s.id
      WHERE dr.staff_id = ?
      ORDER BY dr.role
    `).all(parseInt(staffId));
  } else if (date) {
    // Get all dedicated roles active on a specific date
    const dayOfWeek = new Date(date + "T00:00:00").getDay();
    rows = db.prepare(`
      SELECT dr.*, s.name as staff_name
      FROM staff_dedicated_role dr
      JOIN staff s ON dr.staff_id = s.id
      WHERE (dr.day_of_week IS NULL OR dr.day_of_week = ?)
      AND (dr.start_date IS NULL OR dr.start_date <= ?)
      AND (dr.end_date IS NULL OR dr.end_date >= ?)
    `).all(dayOfWeek, date, date);
  } else {
    rows = db.prepare(`
      SELECT dr.*, s.name as staff_name
      FROM staff_dedicated_role dr
      JOIN staff s ON dr.staff_id = s.id
      ORDER BY s.name, dr.role
    `).all();
  }

  db.close();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validationError = validateDedicatedRoleCreate(body);
  if (validationError) return validationError;

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO staff_dedicated_role (staff_id, role, label, day_of_week, start_date, end_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.staff_id,
    body.role,
    body.label || null,
    body.day_of_week ?? null,
    body.start_date || null,
    body.end_date || null,
    body.notes || null,
  );

  db.close();
  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(`DELETE FROM staff_dedicated_role WHERE id = ?`).run(parseInt(id));
  db.close();

  if (result.changes === 0) {
    return NextResponse.json({ error: "Dedicated role not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
