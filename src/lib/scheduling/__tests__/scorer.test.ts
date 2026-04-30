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

describe("scoreCandidates — cross-week rotation", () => {
  let db: ReturnType<typeof makeTestDb>;
  const DATE = "2026-04-29";
  const DOW = 3;

  beforeEach(() => {
    db = makeTestDb();
    db.prepare(`
      INSERT INTO staff (id, name) VALUES
        (1, 'Heavy Hannah'),
        (2, 'Light Lou'),
        (3, 'Median Marco')
    `).run();
    db.prepare("INSERT INTO student (id, name) VALUES (1, 'Sam')").run();
    for (const id of [1, 2, 3]) {
      db.prepare(
        "INSERT INTO staff_student_training (staff_id, student_id, approved) VALUES (?, 1, 1)"
      ).run(id);
      db.prepare(
        "INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time) VALUES (?, ?, '07:00', '17:00')"
      ).run(id, DOW);
    }

    // Seed trailing-window history. Lookback is 28 days, ending the day before DATE.
    // Pack 12 shifts for Hannah, 4 shifts for Marco, 0 shifts for Lou — Marco is the median.
    const seedShift = db.prepare(
      "INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, status) VALUES (1, ?, ?, '08:00', '09:00', 'scheduled')"
    );
    // Hannah: 12 shifts spread over 12 days inside the window
    for (let i = 1; i <= 12; i++) {
      const d = new Date("2026-04-29T00:00:00");
      d.setDate(d.getDate() - i);
      seedShift.run(1, d.toISOString().split("T")[0]);
    }
    // Marco: 4 shifts inside the window
    for (let i = 1; i <= 4; i++) {
      const d = new Date("2026-04-29T00:00:00");
      d.setDate(d.getDate() - i);
      seedShift.run(3, d.toISOString().split("T")[0]);
    }
  });

  afterEach(() => clearTestDb());

  it("tags under-used staff and over-used staff differently", () => {
    const candidates = scoreCandidates({
      studentId: 1, date: DATE, startTime: "10:00", endTime: "12:00",
      shiftType: "regular", needsSwimSupport: false,
    });
    const lou = candidates.find(c => c.staffId === 2);
    const hannah = candidates.find(c => c.staffId === 1);
    expect(lou?.tags).toContain("under-used 4w");
    expect(hannah?.tags).toContain("over-used 4w");
  });

  it("ranks the under-used candidate above the over-used candidate when other factors match", () => {
    const candidates = scoreCandidates({
      studentId: 1, date: DATE, startTime: "10:00", endTime: "12:00",
      shiftType: "regular", needsSwimSupport: false,
    });
    const lou = candidates.find(c => c.staffId === 2)!;
    const hannah = candidates.find(c => c.staffId === 1)!;
    expect(lou.totalScore).toBeGreaterThan(hannah.totalScore);
  });
});
