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
  type: "over_twice" | "untrained" | "overlap" | "pto_conflict" | "swim_heavy" | "overnight_rest" | "uncovered";
  severity: "error" | "warning" | "info";
  message: string;
  shiftId?: number;
  staffId?: number;
  studentId?: number;
}
