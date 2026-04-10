export interface Staff {
  id: number;
  name: string;
  role: string;
  active: boolean;
  canWorkOvernight: boolean;
  canCoverSwim: boolean;
  maxHoursPerWeek: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: number;
  name: string;
  active: boolean;
  requiresSwimSupport: boolean;
  staffingRatio: number;
  groupId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffAvailability {
  id: number;
  staffId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface StaffPto {
  id: number;
  staffId: number;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface StaffStudentTraining {
  id: number;
  staffId: number;
  studentId: number;
  approved: boolean;
  certifiedDate: string | null;
  notes: string | null;
}

export interface Shift {
  id: number;
  studentId: number;
  assignedStaffId: number | null;
  date: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  activityType: string;
  needsSwimSupport: boolean;
  status: string;
  overrideNote: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Callout {
  id: number;
  shiftId: number;
  originalStaffId: number;
  replacementStaffId: number | null;
  calledOutAt: string;
  reason: string | null;
  resolved: boolean;
}

export interface ShiftTemplate {
  id: number;
  studentId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  shiftType: string;
  activityType: string;
  needsSwimSupport: boolean;
  notes: string | null;
}

export interface StudentAbsence {
  id: number;
  studentId: number;
  date: string;
  reason: string | null;
  createdAt: string;
}

export interface StaffDedicatedRole {
  id: number;
  staffId: number;
  role: string;
  label: string | null;
  dayOfWeek: number | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface StaffStudentPreference {
  id: number;
  staffId: number;
  studentId: number;
  level: "preferred" | "neutral" | "avoid";
  reason: string | null;
  createdAt: string;
}

export interface StaffOnboarding {
  id: number;
  staffId: number;
  studentId: number;
  currentDay: number;
  totalDays: number;
  scheduledDate: string | null;
  completed: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudentGroup {
  id: number;
  name: string;
  staffingRatio: number;
  active: boolean;
  notes: string | null;
  createdAt: string;
}

export interface StudentGroupMember {
  id: number;
  groupId: number;
  studentId: number;
}

export interface CandidateScore {
  staffId: number;
  staffName: string;
  totalScore: number;
  factors: {
    trained: boolean;
    available: boolean;
    sameStudentCount: number;
    swimCount: number;
    totalShiftsThisWeek: number;
    overnightEligible: boolean;
    swimEligible: boolean;
    preferenceLevel: "preferred" | "neutral" | "avoid" | null;
    hasDedicatedRole: boolean;
    onboardingDay: number | null;
  };
  tags: string[];
  warnings: string[];
  excluded: boolean;
  excludeReason?: string;
}

export interface ShiftWithDetails extends Shift {
  studentName: string;
  staffName: string | null;
}

export interface WeekSchedule {
  weekStart: string;
  weekEnd: string;
  days: {
    date: string;
    dayName: string;
    shifts: ShiftWithDetails[];
  }[];
  warnings: ScheduleWarning[];
}

export interface ScheduleWarning {
  type: "over_twice" | "untrained" | "overlap" | "pto_conflict" | "swim_heavy" | "overnight_rest" | "uncovered" | "student_absent" | "dedicated_role_conflict" | "onboarding_sequence_broken";
  severity: "error" | "warning" | "info";
  message: string;
  shiftId?: number;
  staffId?: number;
  studentId?: number;
}
