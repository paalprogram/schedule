import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scoreCandidates } from "@/lib/scheduling/scorer";
import { makeTestDb, clearTestDb } from "./test-db";

describe("scoreCandidates", () => {
  let db: ReturnType<typeof makeTestDb>;

  // 2026-04-29 is a Wednesday (day 3). Use this throughout for stable fixtures.
  const DATE = "2026-04-29";
  const DOW = 3;

  beforeEach(() => {
    db = makeTestDb();
    // 3 staff: trained, untrained, on-PTO
    db.prepare(`
      INSERT INTO staff (id, name, can_work_overnight, can_cover_swim) VALUES
        (1, 'Trained Tara', 0, 0),
        (2, 'Untrained Uma', 0, 0),
        (3, 'On-PTO Pat', 0, 0)
    `).run();
    db.prepare("INSERT INTO student (id, name) VALUES (1, 'Sam')").run();
    // Tara is trained on Sam.
    db.prepare(
      "INSERT INTO staff_student_training (staff_id, student_id, approved) VALUES (1, 1, 1)"
    ).run();
    // All three staff are available 08:00–17:00 on Wednesday.
    for (const id of [1, 2, 3]) {
      db.prepare(
        "INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time) VALUES (?, ?, '08:00', '17:00')"
      ).run(id, DOW);
    }
    // Pat is on PTO today.
    db.prepare(
      "INSERT INTO staff_pto (staff_id, start_date, end_date) VALUES (3, ?, ?)"
    ).run(DATE, DATE);
  });

  afterEach(() => clearTestDb());

  it("hard-excludes the PTO staff in auto mode", () => {
    const candidates = scoreCandidates({
      studentId: 1, date: DATE, startTime: "09:00", endTime: "12:00",
      shiftType: "regular", needsSwimSupport: false,
    });
    const pat = candidates.find(c => c.staffId === 3);
    expect(pat?.excluded).toBe(true);
    expect(pat?.excludeReason).toMatch(/PTO/i);
  });

  it("hard-excludes untrained staff in auto mode", () => {
    const candidates = scoreCandidates({
      studentId: 1, date: DATE, startTime: "09:00", endTime: "12:00",
      shiftType: "regular", needsSwimSupport: false,
    });
    const uma = candidates.find(c => c.staffId === 2);
    expect(uma?.excluded).toBe(true);
    expect(uma?.excludeReason).toMatch(/trained/i);
  });

  it("includes untrained staff with a warning in manual mode", () => {
    const candidates = scoreCandidates({
      studentId: 1, date: DATE, startTime: "09:00", endTime: "12:00",
      shiftType: "regular", needsSwimSupport: false, mode: "manual",
    });
    const uma = candidates.find(c => c.staffId === 2);
    expect(uma?.excluded).toBe(false);
    expect(uma?.warnings.some(w => /trained/i.test(w))).toBe(true);
  });

  it("ranks the trained, available, no-conflict staff first", () => {
    const candidates = scoreCandidates({
      studentId: 1, date: DATE, startTime: "09:00", endTime: "12:00",
      shiftType: "regular", needsSwimSupport: false,
    });
    expect(candidates[0].staffId).toBe(1);
    expect(candidates[0].excluded).toBe(false);
    expect(candidates[0].factors.trained).toBe(true);
  });

  it("excludes a candidate who already has an overlapping shift", () => {
    db.prepare(
      "INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, status) VALUES (1, 1, ?, '10:00', '13:00', 'scheduled')"
    ).run(DATE);
    const candidates = scoreCandidates({
      studentId: 1, date: DATE, startTime: "11:00", endTime: "14:00",
      shiftType: "regular", needsSwimSupport: false,
    });
    const tara = candidates.find(c => c.staffId === 1);
    expect(tara?.excluded).toBe(true);
    expect(tara?.excludeReason).toMatch(/overlap/i);
  });
});
