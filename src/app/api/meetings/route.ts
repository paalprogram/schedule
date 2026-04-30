import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { validateMeetingCreate } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");
  const date = searchParams.get("date");

  const db = getDb(true);
  let meetings;

  if (date) {
    meetings = db.prepare(`SELECT * FROM meeting WHERE date = ? ORDER BY start_time`).all(date);
  } else if (weekStart && weekEnd) {
    meetings = db.prepare(`SELECT * FROM meeting WHERE date >= ? AND date <= ? ORDER BY date, start_time`).all(weekStart, weekEnd);
  } else {
    meetings = db.prepare(`SELECT * FROM meeting ORDER BY date DESC, start_time LIMIT 100`).all();
  }

  // Load attendees for each meeting
  const result = (meetings as Array<Record<string, unknown>>).map(m => {
    const attendees = db.prepare(`
      SELECT ma.staff_id, s.name as staff_name, ma.required
      FROM meeting_attendee ma
      JOIN staff s ON ma.staff_id = s.id
      WHERE ma.meeting_id = ?
    `).all(m.id) as Array<{ staff_id: number; staff_name: string; required: number }>;

    return {
      ...m,
      attendees: attendees.map(a => ({
        staffId: a.staff_id,
        staffName: a.staff_name,
        required: !!a.required,
      })),
    };
  });

  db.close();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validationError = validateMeetingCreate(body);
  if (validationError) return validationError;

  const db = getDb();

  const meetingId = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO meeting (title, meeting_type, date, start_time, end_time, location, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.title,
      body.meeting_type || "team_meeting",
      body.date,
      body.start_time,
      body.end_time,
      body.location || null,
      body.notes || null,
    );

    if (body.staff_ids && Array.isArray(body.staff_ids)) {
      const insert = db.prepare(
        "INSERT OR IGNORE INTO meeting_attendee (meeting_id, staff_id, required) VALUES (?, ?, 1)"
      );
      for (const staffId of body.staff_ids) {
        insert.run(result.lastInsertRowid, staffId);
      }
    }

    return result.lastInsertRowid;
  })();

  const meeting = db.prepare("SELECT * FROM meeting WHERE id = ?").get(meetingId);
  db.close();
  return NextResponse.json(meeting, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();

  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (body.title !== undefined) { sets.push("title = ?"); params.push(body.title); }
  if (body.meeting_type !== undefined) { sets.push("meeting_type = ?"); params.push(body.meeting_type); }
  if (body.date !== undefined) { sets.push("date = ?"); params.push(body.date); }
  if (body.start_time !== undefined) { sets.push("start_time = ?"); params.push(body.start_time); }
  if (body.end_time !== undefined) { sets.push("end_time = ?"); params.push(body.end_time); }
  if (body.location !== undefined) { sets.push("location = ?"); params.push(body.location); }
  if (body.notes !== undefined) { sets.push("notes = ?"); params.push(body.notes); }

  db.transaction(() => {
    if (sets.length > 0) {
      params.push(body.id);
      db.prepare(`UPDATE meeting SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    }

    if (body.staff_ids && Array.isArray(body.staff_ids)) {
      db.prepare("DELETE FROM meeting_attendee WHERE meeting_id = ?").run(body.id);
      const insert = db.prepare(
        "INSERT INTO meeting_attendee (meeting_id, staff_id, required) VALUES (?, ?, 1)"
      );
      for (const staffId of body.staff_ids) {
        insert.run(body.id, staffId);
      }
    }
  })();

  const meeting = db.prepare("SELECT * FROM meeting WHERE id = ?").get(body.id);
  db.close();
  return NextResponse.json(meeting);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  const result = db.transaction(() => {
    db.prepare("DELETE FROM meeting_attendee WHERE meeting_id = ?").run(parseInt(id));
    return db.prepare("DELETE FROM meeting WHERE id = ?").run(parseInt(id));
  })();
  db.close();

  if (result.changes === 0) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
