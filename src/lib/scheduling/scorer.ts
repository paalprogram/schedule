import Database from "better-sqlite3";
import path from "path";
import type { CandidateScore } from "@/types";
import {
  isStaffOnPto,
  isStaffAvailable,
  hasOverlappingShift,
  isStaffTrained,
  getStaffStudentCountForWeek,
  getStaffSwimCountForWeek,
  getStaffShiftsForWeek,
} from "./conflicts";

function getDb() {
  const dbPath = path.join(process.cwd(), "data", "schedule.db");
  const db = new Database(dbPath, { readonly: true });
  db.pragma("foreign_keys = ON");
  return db;
}

interface ScoreShiftInput {
  studentId: number;
  date: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  needsSwimSupport: boolean;
  excludeShiftId?: number; // when re-scoring for an existing shift
}

function getWeekBounds(date: string): { weekStart: string; weekEnd: string } {
  const d = new Date(date + "T00:00:00");
  const day = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const fmt = (dt: Date) => dt.toISOString().split("T")[0];
  return { weekStart: fmt(monday), weekEnd: fmt(friday) };
}

export function scoreCandidates(input: ScoreShiftInput): CandidateScore[] {
  const db = getDb();
  const { weekStart, weekEnd } = getWeekBounds(input.date);
  const dayOfWeek = new Date(input.date + "T00:00:00").getDay();

  // Get all active staff
  const allStaff = db.prepare(`
    SELECT id, name, can_work_overnight, can_cover_swim FROM staff WHERE active = 1
  `).all() as Array<{
    id: number; name: string; can_work_overnight: number; can_cover_swim: number;
  }>;
  db.close();

  const isOvernight = input.shiftType === "overnight";
  const isSwim = input.needsSwimSupport;

  // Get average swim count for normalization
  const swimCounts = allStaff.map(s => getStaffSwimCountForWeek(s.id, weekStart, weekEnd));
  const avgSwim = swimCounts.length > 0
    ? swimCounts.reduce((a, b) => a + b, 0) / swimCounts.length
    : 0;

  const candidates: CandidateScore[] = allStaff.map((s, idx) => {
    const tags: string[] = [];
    const warnings: string[] = [];
    let excluded = false;
    let excludeReason: string | undefined;

    // Hard filters
    const onPto = isStaffOnPto(s.id, input.date);
    if (onPto) {
      excluded = true;
      excludeReason = "On PTO";
      tags.push("PTO conflict");
    }

    const overlap = hasOverlappingShift(s.id, input.date, input.startTime, input.endTime, input.excludeShiftId);
    if (overlap) {
      excluded = true;
      excludeReason = excludeReason ? excludeReason + " + Overlap conflict" : "Overlap conflict";
      tags.push("overlap conflict");
    }

    const available = isStaffAvailable(s.id, dayOfWeek, input.startTime, input.endTime);

    // Factors
    const trained = isStaffTrained(s.id, input.studentId);
    const sameStudentCount = getStaffStudentCountForWeek(s.id, input.studentId, weekStart, weekEnd);
    const swimCount = swimCounts[idx];
    const weekShifts = getStaffShiftsForWeek(s.id, weekStart, weekEnd);
    const totalShiftsThisWeek = weekShifts.length;
    const overnightEligible = !!s.can_work_overnight;
    const swimEligible = !!s.can_cover_swim;

    // Build tags
    tags.push(trained ? "trained" : "not trained");
    if (available) tags.push("available");
    else if (!excluded) tags.push("limited availability");
    if (sameStudentCount >= 2) tags.push(`${sameStudentCount}x this week`);
    if (isSwim && swimEligible) tags.push("swim certified");
    if (isSwim && !swimEligible) tags.push("no swim cert");
    if (isSwim && swimCount > avgSwim) tags.push("swim-heavy");
    if (isOvernight && overnightEligible) tags.push("overnight OK");
    if (isOvernight && !overnightEligible) tags.push("no overnight");

    // Build warnings
    if (!trained) warnings.push("Not trained on this student");
    if (sameStudentCount >= 2) warnings.push(`Already assigned to this student ${sameStudentCount} times this week`);
    if (isSwim && !swimEligible) warnings.push("Not swim certified");
    if (isSwim && swimCount > avgSwim + 1) warnings.push(`High swim load (${swimCount} this week)`);
    if (isOvernight && !overnightEligible) warnings.push("Not cleared for overnight shifts");
    if (!available && !excluded) warnings.push("Outside stated availability hours");

    // Score calculation
    let score = 0;
    if (!excluded) {
      // Trained: +40
      score += trained ? 40 : 0;

      // Available: +15
      score += available ? 15 : 5;

      // Same student count: +15
      if (sameStudentCount === 0) score += 15;
      else if (sameStudentCount === 1) score += 10;
      // 2+ = 0

      // Swim balance: +10
      if (isSwim) {
        if (swimCount < avgSwim) score += 10;
        else if (swimCount <= avgSwim + 1) score += 5;
      } else {
        score += 10; // non-swim shift, no penalty
      }

      // Overall load: +10
      if (totalShiftsThisWeek <= 4) score += 10;
      else if (totalShiftsThisWeek <= 6) score += 5;

      // Overnight: +5
      if (isOvernight) {
        score += overnightEligible ? 5 : 0;
      } else {
        score += 5;
      }

      // Swim capable: +5
      if (isSwim) {
        score += swimEligible ? 5 : 0;
      } else {
        score += 5;
      }

      // Penalties
      if (sameStudentCount >= 3) score -= 20;
      if (!trained) score -= 30;
      if (isOvernight && !overnightEligible) score -= 50;
    }

    return {
      staffId: s.id,
      staffName: s.name,
      totalScore: Math.max(0, score),
      factors: {
        trained,
        available,
        sameStudentCount,
        swimCount,
        totalShiftsThisWeek,
        overnightEligible,
        swimEligible,
      },
      tags,
      warnings,
      excluded,
      excludeReason,
    };
  });

  // Sort: non-excluded first, then by score descending
  candidates.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    return b.totalScore - a.totalScore;
  });

  return candidates;
}
