/**
 * Centralized scheduling rules and score weights.
 * All thresholds and scoring constants live here so a supervisor
 * can eventually adjust them from a single place.
 */

/** Maximum times the same staff should be assigned to the same student per week (real schedules show 3 is acceptable) */
export const MAX_SAME_STUDENT_PER_WEEK = 3;

/** Maximum swim shifts per staff member per week before triggering a warning */
export const MAX_SWIM_SHIFTS_PER_WEEK = 2;

/**
 * Weekly shift-load thresholds — three bands so the score steps down
 * gradually instead of cliffing from +15 → +5 in one shift's difference.
 * Counts are inclusive: ≤LOW gets LOAD_LOW, ≤MEDIUM gets LOAD_MEDIUM,
 * ≤HIGH gets LOAD_HIGH, anything above HIGH gets 0.
 */
export const LOAD_THRESHOLDS = {
  LOW: 3,
  MEDIUM: 5,
  HIGH: 7,
} as const;

/**
 * Auto-assign score thresholds — moved here so the two callers
 * (generator.ts auto-assign, staff-out auto-reassign) can't drift.
 */
export const ASSIGN_THRESHOLDS = {
  /** Minimum score to auto-assign a primary or second staff during weekly auto-assign */
  AUTO: 35,
  /** More permissive cutoff for emergency reassignment after a callout */
  REASSIGN: 30,
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

  // Same-student gradient — smoothed so 2× this week is mildly preferred over
  // 3×, and 3× (the documented "acceptable" max) is a soft no-bonus signal
  // before the hard penalty kicks in at 4+.
  SAME_STUDENT_ZERO: 15,
  SAME_STUDENT_ONE: 10,
  SAME_STUDENT_TWO: 5,
  SAME_STUDENT_THREE: -3,

  SWIM_BELOW_AVG: 10,
  SWIM_NEAR_AVG: 5,
  NON_SWIM: 10,

  // Load bands — graduated so the difference between 4 and 5 shifts is small.
  LOAD_LOW: 15,
  LOAD_MEDIUM: 10,
  LOAD_HIGH: 5,

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
