import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateOnboardingCreate } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staff_id");
  const studentId = searchParams.get("student_id");
  const activeOnly = searchParams.get("active") !== "false"; // default: only incomplete

  const db = getDb(true);
  let rows;

  const completedFilter = activeOnly ? "AND o.completed = 0" : "";

  if (staffId && studentId) {
    rows = db.prepare(`
      SELECT o.*, s.name as staff_name, st.name as student_name
      FROM staff_onboarding o
      JOIN staff s ON o.staff_id = s.id
      JOIN student st ON o.student_id = st.id
      WHERE o.staff_id = ? AND o.student_id = ? ${completedFilter}
      ORDER BY o.current_day
    `).all(parseInt(staffId), parseInt(studentId));
  } else if (staffId) {
    rows = db.prepare(`
      SELECT o.*, s.name as staff_name, st.name as student_name
      FROM staff_onboarding o
      JOIN staff s ON o.staff_id = s.id
      JOIN student st ON o.student_id = st.id
      WHERE o.staff_id = ? ${completedFilter}
      ORDER BY st.name
    `).all(parseInt(staffId));
  } else if (studentId) {
    rows = db.prepare(`
      SELECT o.*, s.name as staff_name, st.name as student_name
      FROM staff_onboarding o
      JOIN staff s ON o.staff_id = s.id
      JOIN student st ON o.student_id = st.id
      WHERE o.student_id = ? ${completedFilter}
      ORDER BY s.name
    `).all(parseInt(studentId));
  } else {
    rows = db.prepare(`
      SELECT o.*, s.name as staff_name, st.name as student_name
      FROM staff_onboarding o
      JOIN staff s ON o.staff_id = s.id
      JOIN student st ON o.student_id = st.id
      ${activeOnly ? "WHERE o.completed = 0" : ""}
      ORDER BY o.scheduled_date, s.name
    `).all();
  }

  db.close();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validationError = validateOnboardingCreate(body);
  if (validationError) return validationError;

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO staff_onboarding (staff_id, student_id, current_day, total_days, scheduled_date, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    body.staff_id,
    body.student_id,
    body.current_day || 1,
    body.total_days || 3,
    body.scheduled_date || null,
    body.notes || null,
  );
  db.close();
  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
}

// PATCH: advance day or mark complete
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = body.id;
  if (!id || typeof id !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare("SELECT * FROM staff_onboarding WHERE id = ?").get(id) as {
    id: number; current_day: number; total_days: number; completed: number;
  } | undefined;

  if (!existing) {
    db.close();
    return NextResponse.json({ error: "Onboarding record not found" }, { status: 404 });
  }

  if (body.action === "advance") {
    const nextDay = existing.current_day + 1;
    const isComplete = nextDay > existing.total_days;

    db.prepare(`
      UPDATE staff_onboarding
      SET current_day = ?, completed = ?, scheduled_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      isComplete ? existing.total_days : nextDay,
      isComplete ? 1 : 0,
      body.next_scheduled_date || null,
      id,
    );

    db.close();
    return NextResponse.json({
      id,
      currentDay: isComplete ? existing.total_days : nextDay,
      completed: isComplete,
    });
  }

  // Generic update
  if (body.scheduled_date !== undefined) {
    db.prepare("UPDATE staff_onboarding SET scheduled_date = ?, updated_at = datetime('now') WHERE id = ?")
      .run(body.scheduled_date, id);
  }
  if (body.completed !== undefined) {
    db.prepare("UPDATE staff_onboarding SET completed = ?, updated_at = datetime('now') WHERE id = ?")
      .run(body.completed ? 1 : 0, id);
  }
  if (body.notes !== undefined) {
    db.prepare("UPDATE staff_onboarding SET notes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(body.notes, id);
  }

  db.close();
  return NextResponse.json({ updated: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const db = getDb();
  const result = db.prepare("DELETE FROM staff_onboarding WHERE id = ?").run(parseInt(id));
  db.close();
  if (result.changes === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
