import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { timesOverlap, isStaffAvailable, hasOverlappingShift } from "@/lib/scheduling/conflicts";
import { makeTestDb, clearTestDb } from "./test-db";

describe("timesOverlap", () => {
  it("detects identical ranges as overlapping", () => {
    expect(timesOverlap("09:00", "12:00", "09:00", "12:00")).toBe(true);
  });

  it("detects partial overlap (b starts inside a)", () => {
    expect(timesOverlap("09:00", "12:00", "10:00", "13:00")).toBe(true);
  });

  it("detects partial overlap (a starts inside b)", () => {
    expect(timesOverlap("10:00", "13:00", "09:00", "12:00")).toBe(true);
  });

  it("treats touching ranges as non-overlapping (end == start)", () => {
    expect(timesOverlap("09:00", "12:00", "12:00", "15:00")).toBe(false);
    expect(timesOverlap("12:00", "15:00", "09:00", "12:00")).toBe(false);
  });

  it("returns false for fully disjoint ranges", () => {
    expect(timesOverlap("09:00", "10:00", "11:00", "12:00")).toBe(false);
  });

  it("handles overnight ranges (wraparound)", () => {
    // 22:00 -> 06:00 wraps midnight; another 23:00 -> 01:00 also wraps
    expect(timesOverlap("22:00", "06:00", "23:00", "01:00")).toBe(true);
  });

  it("detects overnight overlapping with morning shift on next day boundary", () => {
    // Overnight 22:00 -> 06:00 vs morning 05:00 -> 09:00 (same calendar reference)
    expect(timesOverlap("22:00", "06:00", "05:00", "09:00")).toBe(true);
  });

  it("non-overnight before an overnight shift does not overlap", () => {
    // 18:00 -> 21:00 is fully before 22:00 -> 06:00
    expect(timesOverlap("18:00", "21:00", "22:00", "06:00")).toBe(false);
  });

  it("contained range overlaps", () => {
    expect(timesOverlap("10:00", "11:00", "09:00", "12:00")).toBe(true);
  });
});

describe("isStaffAvailable", () => {
  let db: ReturnType<typeof makeTestDb>;

  beforeEach(() => {
    db = makeTestDb();
    db.prepare("INSERT INTO staff (id, name) VALUES (1, 'Alex')").run();
  });

  afterEach(() => clearTestDb());

  it("returns false when no availability rows exist", () => {
    expect(isStaffAvailable(1, 1, "09:00", "12:00")).toBe(false);
  });

  it("returns true when shift fits inside a same-day availability slot", () => {
    db.prepare(
      "INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time) VALUES (1, 1, '08:00', '17:00')"
    ).run();
    expect(isStaffAvailable(1, 1, "09:00", "12:00")).toBe(true);
  });

  it("returns false when shift spills past availability end", () => {
    db.prepare(
      "INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time) VALUES (1, 1, '08:00', '12:00')"
    ).run();
    expect(isStaffAvailable(1, 1, "09:00", "13:00")).toBe(false);
  });

  it("returns false when shift starts before availability start", () => {
    db.prepare(
      "INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time) VALUES (1, 1, '10:00', '17:00')"
    ).run();
    expect(isStaffAvailable(1, 1, "09:00", "12:00")).toBe(false);
  });

  it("checks the correct day of week", () => {
    // Availability only on Tuesday (2). Shift requested for Monday (1).
    db.prepare(
      "INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time) VALUES (1, 2, '08:00', '17:00')"
    ).run();
    expect(isStaffAvailable(1, 1, "09:00", "12:00")).toBe(false);
    expect(isStaffAvailable(1, 2, "09:00", "12:00")).toBe(true);
  });

  it("supports an overnight shift split across two day-of-week availability rows", () => {
    // Saturday (6) evening into Sunday (0) morning
    db.prepare(
      "INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time) VALUES (1, 6, '20:00', '24:00')"
    ).run();
    db.prepare(
      "INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time) VALUES (1, 0, '00:00', '08:00')"
    ).run();
    // Shift Sat 22:00 -> Sun 06:00
    expect(isStaffAvailable(1, 6, "22:00", "06:00")).toBe(true);
  });
});

describe("hasOverlappingShift", () => {
  let db: ReturnType<typeof makeTestDb>;

  beforeEach(() => {
    db = makeTestDb();
    db.prepare("INSERT INTO staff (id, name) VALUES (1, 'Alex')").run();
    db.prepare("INSERT INTO student (id, name) VALUES (1, 'Sam'), (2, 'Jordan')").run();
  });

  afterEach(() => clearTestDb());

  it("returns false when staff has no shifts", () => {
    expect(hasOverlappingShift(1, "2026-04-29", "09:00", "12:00")).toBe(false);
  });

  it("detects same-day overlap", () => {
    db.prepare(
      "INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, status) VALUES (1, 1, '2026-04-29', '10:00', '13:00', 'scheduled')"
    ).run();
    expect(hasOverlappingShift(1, "2026-04-29", "09:00", "12:00")).toBe(true);
  });

  it("ignores called_out shifts (slot is freed)", () => {
    db.prepare(
      "INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, status) VALUES (1, 1, '2026-04-29', '10:00', '13:00', 'called_out')"
    ).run();
    expect(hasOverlappingShift(1, "2026-04-29", "09:00", "12:00")).toBe(false);
  });

  it("respects excludeShiftId so a shift doesn't see itself", () => {
    const result = db.prepare(
      "INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, status) VALUES (1, 1, '2026-04-29', '10:00', '13:00', 'scheduled')"
    ).run();
    const shiftId = Number(result.lastInsertRowid);
    expect(hasOverlappingShift(1, "2026-04-29", "10:00", "13:00", shiftId)).toBe(false);
  });

  it("detects yesterday's overnight shift bleeding into today's morning", () => {
    // Overnight Mon 22:00 -> Tue 06:00 stored on 2026-04-27 (Mon)
    db.prepare(
      "INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, status, shift_type) VALUES (1, 1, '2026-04-27', '22:00', '06:00', 'scheduled', 'overnight')"
    ).run();
    // Tue morning shift 05:00 -> 09:00 should clash
    expect(hasOverlappingShift(1, "2026-04-28", "05:00", "09:00")).toBe(true);
  });

  it("does not flag yesterday's regular shift against today", () => {
    db.prepare(
      "INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, status) VALUES (1, 1, '2026-04-27', '14:00', '18:00', 'scheduled')"
    ).run();
    expect(hasOverlappingShift(1, "2026-04-28", "08:00", "10:00")).toBe(false);
  });
});
