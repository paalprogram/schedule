/**
 * Centralized scheduling rules and score weights.
 * All thresholds and scoring constants live here so a supervisor
 * can eventually adjust them from a single place.
 */

/** Maximum times the same staff should be assigned to the same student per week (real schedules show 3 is acceptable) */
export const MAX_SAME_STUDENT_PER_WEEK = 3;

/** Maximum swim shifts per staff member per week before triggering a warning */
export const MAX_SWIM_SHIFTS_PER_WEEK = 2;

/** Weekly shift-load thresholds used for scoring */
export const LOAD_THRESHOLDS = {
  /** At or below this count the staff member is considered low-load */
  LOW: 4,
  /** At or below this count the staff member is considered medium-load */
  MEDIUM: 6,
} as const;

/** Cross-week rotation: how far back to look and how strict the bands are */
export const ROTATION = {
  /** Days of trailing history to consider (4 weeks) */
  LOOKBACK_DAYS: 28,
  /** Below this fraction of the team median, a staff is "under-used" → bonus */
  UNDER_USED_RATIO: 0.75,
  /** Above this fraction of the team median, a staff is "over-used" → penalty */
  OVER_USED_RATIO: 1.25,
  /** Minimum number of staff with shift history needed to compute a meaningful median */
  MIN_STAFF_FOR_ROTATION: 3,
} as const;

/** Point values used by the candidate scorer */
export const SCORE_WEIGHTS = {
  TRAINED: 40,
  AVAILABLE: 15,
  AVAILABLE_PARTIAL: 5,

  SAME_STUDENT_ZERO: 15,
  SAME_STUDENT_ONE: 10,
  SAME_STUDENT_TWO: 0,

  SWIM_BELOW_AVG: 10,
  SWIM_NEAR_AVG: 5,
  NON_SWIM: 10,

  LOAD_LOW: 15,
  LOAD_MEDIUM: 5,

  OVERNIGHT_ELIGIBLE: 5,
  SWIM_ELIGIBLE: 5,

  PREFERENCE_PREFERRED: 25,
  PREFERENCE_AVOID: -35,

  ONBOARDING_THIS_STUDENT: 60,

  /** Cross-week rotation — small bonus/penalty so under-utilized staff get a tiebreaker edge */
  ROTATION_UNDER_USED: 5,
  ROTATION_OVER_USED: -5,

  PENALTY_OVER_ASSIGNED: -20,
  PENALTY_UNTRAINED: -40,
  PENALTY_OVERNIGHT_INELIGIBLE: -50,
} as const;
