import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateStudentGroupCreate } from "@/lib/validation";

export async function GET() {
  const db = getDb(true);
  const groups = db.prepare(`
    SELECT g.*,
      (SELECT GROUP_CONCAT(sgm.student_id) FROM student_group_member sgm WHERE sgm.group_id = g.id) as member_ids,
      (SELECT GROUP_CONCAT(st.name) FROM student_group_member sgm JOIN student st ON sgm.student_id = st.id WHERE sgm.group_id = g.id) as member_names
    FROM student_group g
    ORDER BY g.active DESC, g.name
  `).all();
  db.close();
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validationError = validateStudentGroupCreate(body);
  if (validationError) return validationError;

  const db = getDb();

  const result = db.prepare(`
    INSERT INTO student_group (name, staffing_ratio, notes)
    VALUES (?, ?, ?)
  `).run(body.name, body.staffing_ratio || 2, body.notes || null);

  const groupId = result.lastInsertRowid;

  // Add members and update their group_id
  if (body.student_ids && Array.isArray(body.student_ids)) {
    const insertMember = db.prepare(
      "INSERT OR IGNORE INTO student_group_member (group_id, student_id) VALUES (?, ?)"
    );
    const updateStudent = db.prepare(
      "UPDATE student SET group_id = ?, updated_at = datetime('now') WHERE id = ?"
    );
    for (const studentId of body.student_ids) {
      insertMember.run(groupId, studentId);
      updateStudent.run(groupId, studentId);
    }
  }

  const group = db.prepare("SELECT * FROM student_group WHERE id = ?").get(groupId);
  db.close();
  return NextResponse.json(group, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();

  if (body.name !== undefined) {
    db.prepare("UPDATE student_group SET name = ? WHERE id = ?").run(body.name, body.id);
  }
  if (body.staffing_ratio !== undefined) {
    db.prepare("UPDATE student_group SET staffing_ratio = ? WHERE id = ?").run(body.staffing_ratio, body.id);
  }
  if (body.active !== undefined) {
    db.prepare("UPDATE student_group SET active = ? WHERE id = ?").run(body.active ? 1 : 0, body.id);
  }
  if (body.notes !== undefined) {
    db.prepare("UPDATE student_group SET notes = ? WHERE id = ?").run(body.notes, body.id);
  }

  // Update members if provided
  if (body.student_ids && Array.isArray(body.student_ids)) {
    // Clear old group_id references
    db.prepare("UPDATE student SET group_id = NULL WHERE group_id = ?").run(body.id);
    db.prepare("DELETE FROM student_group_member WHERE group_id = ?").run(body.id);

    const insertMember = db.prepare(
      "INSERT INTO student_group_member (group_id, student_id) VALUES (?, ?)"
    );
    const updateStudent = db.prepare(
      "UPDATE student SET group_id = ?, updated_at = datetime('now') WHERE id = ?"
    );
    for (const studentId of body.student_ids) {
      insertMember.run(body.id, studentId);
      updateStudent.run(body.id, studentId);
    }
  }

  const group = db.prepare("SELECT * FROM student_group WHERE id = ?").get(body.id);
  db.close();
  return NextResponse.json(group);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  // Clear group_id on students
  db.prepare("UPDATE student SET group_id = NULL WHERE group_id = ?").run(parseInt(id));
  db.prepare("DELETE FROM student_group_member WHERE group_id = ?").run(parseInt(id));
  const result = db.prepare("DELETE FROM student_group WHERE id = ?").run(parseInt(id));
  db.close();

  if (result.changes === 0) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
