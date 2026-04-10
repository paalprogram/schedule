import { NextResponse } from "next/server";

type ValidationError = { field: string; message: string };

function err(errors: ValidationError[]) {
  return NextResponse.json(
    { error: "Validation failed", details: errors },
    { status: 400 }
  );
}

// ── Field checks ──

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00");
  return !isNaN(d.getTime());
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isDayOfWeek(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function isValidRole(value: unknown): value is string {
  return typeof value === "string" && ["direct_care", "lead", "supervisor"].includes(value);
}

function isValidShiftType(value: unknown): value is string {
  return typeof value === "string" && ["regular", "overnight"].includes(value);
}

function isValidActivityType(value: unknown): value is string {
  return typeof value === "string" && ["general", "swimming", "community"].includes(value);
}

function isValidStatus(value: unknown): value is string {
  return typeof value === "string" && ["scheduled", "open", "called_out", "covered"].includes(value);
}

// ── Validators for each entity ──

export function validateStaffCreate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isNonEmptyString(body.name)) errors.push({ field: "name", message: "Name is required" });
  if (body.role !== undefined && !isValidRole(body.role)) errors.push({ field: "role", message: "Role must be direct_care, lead, or supervisor" });
  if (body.max_hours_per_week !== undefined && body.max_hours_per_week !== null) {
    const v = typeof body.max_hours_per_week === "string" ? parseInt(body.max_hours_per_week) : body.max_hours_per_week;
    if (typeof v !== "number" || v < 1 || v > 168) errors.push({ field: "max_hours_per_week", message: "Must be between 1 and 168" });
  }
  return errors.length > 0 ? err(errors) : null;
}

export function validateStaffUpdate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isNonEmptyString(body.name)) errors.push({ field: "name", message: "Name is required" });
  if (body.role !== undefined && !isValidRole(body.role)) errors.push({ field: "role", message: "Role must be direct_care, lead, or supervisor" });
  if (body.max_hours_per_week !== undefined && body.max_hours_per_week !== null) {
    const v = typeof body.max_hours_per_week === "string" ? parseInt(body.max_hours_per_week) : body.max_hours_per_week;
    if (typeof v !== "number" || v < 1 || v > 168) errors.push({ field: "max_hours_per_week", message: "Must be between 1 and 168" });
  }
  if (body.pto && Array.isArray(body.pto)) {
    for (let i = 0; i < body.pto.length; i++) {
      const p = body.pto[i] as Record<string, unknown>;
      if (!isValidDate(p.start_date)) errors.push({ field: `pto[${i}].start_date`, message: "Valid date required (YYYY-MM-DD)" });
      if (!isValidDate(p.end_date)) errors.push({ field: `pto[${i}].end_date`, message: "Valid date required (YYYY-MM-DD)" });
      if (isValidDate(p.start_date) && isValidDate(p.end_date) && p.start_date > p.end_date) {
        errors.push({ field: `pto[${i}]`, message: "End date must be on or after start date" });
      }
    }
  }
  if (body.availability && Array.isArray(body.availability)) {
    for (let i = 0; i < body.availability.length; i++) {
      const a = body.availability[i] as Record<string, unknown>;
      if (!isDayOfWeek(a.day_of_week)) errors.push({ field: `availability[${i}].day_of_week`, message: "Must be 0-6" });
      if (!isValidTime(a.start_time)) errors.push({ field: `availability[${i}].start_time`, message: "Valid time required (HH:MM)" });
      if (!isValidTime(a.end_time)) errors.push({ field: `availability[${i}].end_time`, message: "Valid time required (HH:MM)" });
    }
  }
  return errors.length > 0 ? err(errors) : null;
}

export function validateStudentCreate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isNonEmptyString(body.name)) errors.push({ field: "name", message: "Name is required" });
  if (body.trained_staff_ids && Array.isArray(body.trained_staff_ids)) {
    for (let i = 0; i < body.trained_staff_ids.length; i++) {
      if (!isPositiveInt(body.trained_staff_ids[i])) errors.push({ field: `trained_staff_ids[${i}]`, message: "Must be a positive integer" });
    }
  }
  return errors.length > 0 ? err(errors) : null;
}

export function validateStudentUpdate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isNonEmptyString(body.name)) errors.push({ field: "name", message: "Name is required" });
  if (body.trained_staff_ids && Array.isArray(body.trained_staff_ids)) {
    for (let i = 0; i < body.trained_staff_ids.length; i++) {
      if (!isPositiveInt(body.trained_staff_ids[i])) errors.push({ field: `trained_staff_ids[${i}]`, message: "Must be a positive integer" });
    }
  }
  return errors.length > 0 ? err(errors) : null;
}

export function validateShiftCreate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isPositiveInt(body.student_id)) errors.push({ field: "student_id", message: "Valid student ID required" });
  if (!isValidDate(body.date)) errors.push({ field: "date", message: "Valid date required (YYYY-MM-DD)" });
  if (!isValidTime(body.start_time)) errors.push({ field: "start_time", message: "Valid time required (HH:MM)" });
  if (!isValidTime(body.end_time)) errors.push({ field: "end_time", message: "Valid time required (HH:MM)" });
  if (body.shift_type !== undefined && !isValidShiftType(body.shift_type)) errors.push({ field: "shift_type", message: "Must be regular or overnight" });
  if (body.activity_type !== undefined && !isValidActivityType(body.activity_type)) errors.push({ field: "activity_type", message: "Must be general, swimming, or community" });
  // For regular (non-overnight) shifts, end must be after start
  if (isValidTime(body.start_time) && isValidTime(body.end_time) && body.shift_type !== "overnight") {
    if (body.end_time <= body.start_time) errors.push({ field: "end_time", message: "End time must be after start time for regular shifts" });
  }
  return errors.length > 0 ? err(errors) : null;
}

export function validateShiftUpdate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (body.status !== undefined && !isValidStatus(body.status)) {
    errors.push({ field: "status", message: "Must be scheduled, open, called_out, or covered" });
  }
  if (body.assigned_staff_id !== undefined && body.assigned_staff_id !== null && !isPositiveInt(body.assigned_staff_id)) {
    errors.push({ field: "assigned_staff_id", message: "Must be a valid staff ID or null" });
  }
  return errors.length > 0 ? err(errors) : null;
}

export function validateCalloutCreate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isPositiveInt(body.shift_id)) errors.push({ field: "shift_id", message: "Valid shift ID required" });
  if (!isPositiveInt(body.original_staff_id)) errors.push({ field: "original_staff_id", message: "Valid staff ID required" });
  return errors.length > 0 ? err(errors) : null;
}

export function validateTemplateCreate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isPositiveInt(body.student_id)) errors.push({ field: "student_id", message: "Valid student ID required" });
  if (!isDayOfWeek(body.day_of_week)) errors.push({ field: "day_of_week", message: "Must be 0-6 (Sun-Sat)" });
  if (!isValidTime(body.start_time)) errors.push({ field: "start_time", message: "Valid time required (HH:MM)" });
  if (!isValidTime(body.end_time)) errors.push({ field: "end_time", message: "Valid time required (HH:MM)" });
  if (body.shift_type !== undefined && !isValidShiftType(body.shift_type)) errors.push({ field: "shift_type", message: "Must be regular or overnight" });
  if (body.activity_type !== undefined && !isValidActivityType(body.activity_type)) errors.push({ field: "activity_type", message: "Must be general, swimming, or community" });
  return errors.length > 0 ? err(errors) : null;
}

export function validateTemplateUpdate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isDayOfWeek(body.day_of_week)) errors.push({ field: "day_of_week", message: "Must be 0-6 (Sun-Sat)" });
  if (!isValidTime(body.start_time)) errors.push({ field: "start_time", message: "Valid time required (HH:MM)" });
  if (!isValidTime(body.end_time)) errors.push({ field: "end_time", message: "Valid time required (HH:MM)" });
  if (body.shift_type !== undefined && !isValidShiftType(body.shift_type)) errors.push({ field: "shift_type", message: "Must be regular or overnight" });
  if (body.activity_type !== undefined && !isValidActivityType(body.activity_type)) errors.push({ field: "activity_type", message: "Must be general, swimming, or community" });
  return errors.length > 0 ? err(errors) : null;
}

export function validateAvailabilityCreate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isPositiveInt(body.staff_id)) errors.push({ field: "staff_id", message: "Valid staff ID required" });
  if (!isDayOfWeek(body.day_of_week)) errors.push({ field: "day_of_week", message: "Must be 0-6 (Sun-Sat)" });
  if (!isValidTime(body.start_time)) errors.push({ field: "start_time", message: "Valid time required (HH:MM)" });
  if (!isValidTime(body.end_time)) errors.push({ field: "end_time", message: "Valid time required (HH:MM)" });
  return errors.length > 0 ? err(errors) : null;
}

export function validateAvailabilityUpdate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isDayOfWeek(body.day_of_week)) errors.push({ field: "day_of_week", message: "Must be 0-6 (Sun-Sat)" });
  if (!isValidTime(body.start_time)) errors.push({ field: "start_time", message: "Valid time required (HH:MM)" });
  if (!isValidTime(body.end_time)) errors.push({ field: "end_time", message: "Valid time required (HH:MM)" });
  return errors.length > 0 ? err(errors) : null;
}

export function validateTrainingCreate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isPositiveInt(body.staff_id)) errors.push({ field: "staff_id", message: "Valid staff ID required" });
  if (!isPositiveInt(body.student_id)) errors.push({ field: "student_id", message: "Valid student ID required" });
  return errors.length > 0 ? err(errors) : null;
}

function isValidDedicatedRole(value: unknown): value is string {
  return typeof value === "string" && ["academics", "crisis_support", "other"].includes(value);
}

function isValidPreferenceLevel(value: unknown): value is string {
  return typeof value === "string" && ["preferred", "neutral", "avoid"].includes(value);
}

export function validateStudentAbsenceCreate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isPositiveInt(body.student_id)) errors.push({ field: "student_id", message: "Valid student ID required" });
  if (!isValidDate(body.date)) errors.push({ field: "date", message: "Valid date required (YYYY-MM-DD)" });
  return errors.length > 0 ? err(errors) : null;
}

export function validateDedicatedRoleCreate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isPositiveInt(body.staff_id)) errors.push({ field: "staff_id", message: "Valid staff ID required" });
  if (!isValidDedicatedRole(body.role)) errors.push({ field: "role", message: "Must be academics, crisis_support, or other" });
  if (body.day_of_week !== undefined && body.day_of_week !== null && !isDayOfWeek(body.day_of_week)) {
    errors.push({ field: "day_of_week", message: "Must be 0-6 (Sun-Sat) or null for every day" });
  }
  if (body.start_date !== undefined && body.start_date !== null && !isValidDate(body.start_date)) {
    errors.push({ field: "start_date", message: "Valid date required (YYYY-MM-DD)" });
  }
  if (body.end_date !== undefined && body.end_date !== null && !isValidDate(body.end_date)) {
    errors.push({ field: "end_date", message: "Valid date required (YYYY-MM-DD)" });
  }
  return errors.length > 0 ? err(errors) : null;
}

export function validatePreferenceCreate(body: Record<string, unknown>) {
  const errors: ValidationError[] = [];
  if (!isPositiveInt(body.staff_id)) errors.push({ field: "staff_id", message: "Valid staff ID required" });
  if (!isPositiveInt(body.student_id)) errors.push({ field: "student_id", message: "Valid student ID required" });
  if (!isValidPreferenceLevel(body.level)) errors.push({ field: "level", message: "Must be preferred, neutral, or avoid" });
  return errors.length > 0 ? err(errors) : null;
}

export function validateDateRange(weekStart: string | null, weekEnd: string | null) {
  const errors: ValidationError[] = [];
  if (!weekStart || !isValidDate(weekStart)) errors.push({ field: "weekStart", message: "Valid date required (YYYY-MM-DD)" });
  if (!weekEnd || !isValidDate(weekEnd)) errors.push({ field: "weekEnd", message: "Valid date required (YYYY-MM-DD)" });
  if (weekStart && weekEnd && isValidDate(weekStart) && isValidDate(weekEnd) && weekStart > weekEnd) {
    errors.push({ field: "weekEnd", message: "weekEnd must be on or after weekStart" });
  }
  return errors.length > 0 ? err(errors) : null;
}
