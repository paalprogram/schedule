import Database from "better-sqlite3";
import path from "path";
import type { CandidateScore } from "@/types";
import {
  isStaffOnPto,
  isStaffAvailable,
  hasOverlappingShift,
  getOverlappingAssignments,
  isStaffTrained,
  getStaffStudentCountForWeek,
  getStaffSwimCountForWeek,
  getStaffShiftsForWeek,
  hasStaffDedicatedRole,
  getStaffStudentPreference,
  getStaffOnboardingForDate,
  getActiveOnboardingForDate,
} from "./conflicts";
import { MAX_SAME_STUDENT_PER_WEEK, MAX_SWIM_SHIFTS_PER_WEEK, SCORE_WEIGHTS as W, LOAD_THRESHOLDS } from "./rules";

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
  mode?: "auto" | "manual"; // auto = hard-exclude untrained; manual = show with warnings
}

function getWeekBounds(date: string): { weekStart: string; weekEnd: string } {
  const d = new Date(date + "T00:00:00");
  const day = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (dt: Date) => dt.toISOString().split("T")[0];
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
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

  // Pre-load onboarding records for this date
  const allOnboarding = getActiveOnboardingForDate(input.date);
  // Map staffId -> onboarding record (could be for a different student)
  const onboardingByStaff = new Map(allOnboarding.map(o => [o.staffId, o]));

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
    const dedicatedRole = hasStaffDedicatedRole(s.id, input.date);
    if (dedicatedRole) {
      excluded = true;
      excludeReason = "Has dedicated role";
      tags.push("dedicated role");
    }

    // Onboarding check — staff onboarding with another student today are excluded
    const onboarding = onboardingByStaff.get(s.id);
    let onboardingDay: number | null = null;
    if (onboarding) {
      if (onboarding.studentId === input.studentId) {
        // This staff is onboarding with THIS student — great match
        onboardingDay = onboarding.currentDay;
        tags.push(`onboarding Day ${onboarding.currentDay}/${onboarding.totalDays}`);
      } else {
        // Onboarding with a different student — exclude from this assignment
        excluded = true;
        excludeReason = excludeReason
          ? excludeReason + " + Onboarding elsewhere"
          : `Onboarding with ${onboarding.studentName} today`;
        tags.push("onboarding elsewhere");
      }
    }

    const onPto = isStaffOnPto(s.id, input.date);
    if (onPto) {
      excluded = true;
      excludeReason = excludeReason ? excludeReason + " + On PTO" : "On PTO";
      tags.push("PTO conflict");
    }

    const overlap = hasOverlappingShift(s.id, input.date, input.startTime, input.endTime, input.excludeShiftId);
    if (overlap) {
      if (input.mode === "manual") {
        // In manual mode, show cascade warnings instead of hard-excluding
        const overlapping = getOverlappingAssignments(s.id, input.date, input.startTime, input.endTime, input.excludeShiftId);
        for (const o of overlapping) {
          warnings.push(`Assigning will uncover ${o.studentName}'s ${o.startTime}-${o.endTime} shift`);
        }
        tags.push("cascade risk");
      } else {
        excluded = true;
        excludeReason = excludeReason ? excludeReason + " + Overlap conflict" : "Overlap conflict";
        tags.push("overlap conflict");
      }
    }

    const available = isStaffAvailable(s.id, dayOfWeek, input.startTime, input.endTime);

    // Factors
    const trained = isStaffTrained(s.id, input.studentId);

    // Hard-exclude untrained in auto mode
    if (!trained && input.mode !== "manual") {
      excluded = true;
      excludeReason = excludeReason ? excludeReason + " + Not trained" : "Not trained on this student";
      tags.push("not trained");
    }

    const sameStudentCount = getStaffStudentCountForWeek(s.id, input.studentId, weekStart, weekEnd);
    const swimCount = swimCounts[idx];
    const weekShifts = getStaffShiftsForWeek(s.id, weekStart, weekEnd);
    const totalShiftsThisWeek = weekShifts.length;
    const overnightEligible = !!s.can_work_overnight;
    const swimEligible = !!s.can_cover_swim;
    const preferenceLevel = getStaffStudentPreference(s.id, input.studentId) as "preferred" | "neutral" | "avoid" | null;

    // Preference tags/warnings
    if (preferenceLevel === "preferred") tags.push("preferred");
    if (preferenceLevel === "avoid") {
      tags.push("avoid");
      warnings.push("Marked as avoid for this student");
    }

    // Build tags
    tags.push(trained ? "trained" : "not trained");
    if (available) tags.push("available");
    else if (!excluded) tags.push("limited availability");
    if (sameStudentCount >= MAX_SAME_STUDENT_PER_WEEK) tags.push(`${sameStudentCount}x this week`);
    if (isSwim && swimEligible) tags.push("swim certified");
    if (isSwim && !swimEligible) tags.push("no swim cert");
    if (isSwim && swimCount > avgSwim) tags.push("swim-heavy");
    if (isOvernight && overnightEligible) tags.push("overnight OK");
    if (isOvernight && !overnightEligible) tags.push("no overnight");

    // Build warnings
    if (!trained) warnings.push("Not trained on this student");
    if (sameStudentCount >= MAX_SAME_STUDENT_PER_WEEK) warnings.push(`Already assigned to this student ${sameStudentCount} times this week`);
    if (isSwim && !swimEligible) warnings.push("Not swim certified");
    if (isSwim && swimCount > avgSwim + 1) warnings.push(`High swim load (${swimCount} this week)`);
    if (isOvernight && !overnightEligible) warnings.push("Not cleared for overnight shifts");
    if (!available && !excluded) warnings.push("Outside stated availability hours");

    // Score calculation
    let score = 0;
    if (!excluded) {
      score += trained ? W.TRAINED : 0;
      score += available ? W.AVAILABLE : W.AVAILABLE_PARTIAL;

      if (sameStudentCount === 0) score += W.SAME_STUDENT_ZERO;
      else if (sameStudentCount === 1) score += W.SAME_STUDENT_ONE;
      else if (sameStudentCount === 2) score += W.SAME_STUDENT_TWO;

      if (isSwim) {
        if (swimCount < avgSwim) score += W.SWIM_BELOW_AVG;
        else if (swimCount <= avgSwim + 1) score += W.SWIM_NEAR_AVG;
      } else {
        score += W.NON_SWIM;
      }

      if (totalShiftsThisWeek <= LOAD_THRESHOLDS.LOW) score += W.LOAD_LOW;
      else if (totalShiftsThisWeek <= LOAD_THRESHOLDS.MEDIUM) score += W.LOAD_MEDIUM;

      if (isOvernight) {
        score += overnightEligible ? W.OVERNIGHT_ELIGIBLE : 0;
      } else {
        score += W.OVERNIGHT_ELIGIBLE;
      }

      if (isSwim) {
        score += swimEligible ? W.SWIM_ELIGIBLE : 0;
      } else {
        score += W.SWIM_ELIGIBLE;
      }

      // Onboarding bonus — highest priority assignment
      if (onboardingDay !== null) score += W.ONBOARDING_THIS_STUDENT;

      // Preference bonus/penalty
      if (preferenceLevel === "preferred") score += W.PREFERENCE_PREFERRED;
      else if (preferenceLevel === "avoid") score += W.PREFERENCE_AVOID;

      // Penalties
      if (sameStudentCount >= MAX_SAME_STUDENT_PER_WEEK + 1) score += W.PENALTY_OVER_ASSIGNED;
      if (!trained) score += W.PENALTY_UNTRAINED;
      if (isOvernight && !overnightEligible) score += W.PENALTY_OVERNIGHT_INELIGIBLE;
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
        preferenceLevel,
        hasDedicatedRole: dedicatedRole,
        onboardingDay,
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
