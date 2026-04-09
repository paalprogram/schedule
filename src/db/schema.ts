import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const staff = sqliteTable("staff", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role").default("direct_care"), // direct_care, lead, supervisor
  active: integer("active", { mode: "boolean" }).default(true),
  canWorkOvernight: integer("can_work_overnight", { mode: "boolean" }).default(false),
  canCoverSwim: integer("can_cover_swim", { mode: "boolean" }).default(false),
  maxHoursPerWeek: integer("max_hours_per_week"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const student = sqliteTable("student", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).default(true),
  requiresSwimSupport: integer("requires_swim_support", { mode: "boolean" }).default(false),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const staffStudentTraining = sqliteTable("staff_student_training", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull().references(() => staff.id),
  studentId: integer("student_id").notNull().references(() => student.id),
  approved: integer("approved", { mode: "boolean" }).default(true),
  certifiedDate: text("certified_date"),
  notes: text("notes"),
});

export const staffAvailability = sqliteTable("staff_availability", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull().references(() => staff.id),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: text("start_time").notNull(), // "07:00"
  endTime: text("end_time").notNull(), // "15:00"
});

export const staffPto = sqliteTable("staff_pto", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull().references(() => staff.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reason: text("reason"),
});

export const shift = sqliteTable("shift", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: integer("student_id").notNull().references(() => student.id),
  assignedStaffId: integer("assigned_staff_id").references(() => staff.id),
  date: text("date").notNull(), // "2026-04-10"
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  shiftType: text("shift_type").default("regular"), // regular, overnight
  activityType: text("activity_type").default("general"), // general, swimming, community
  needsSwimSupport: integer("needs_swim_support", { mode: "boolean" }).default(false),
  status: text("status").default("scheduled"), // scheduled, open, called_out, covered
  overrideNote: text("override_note"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const callout = sqliteTable("callout", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shift_id").notNull().references(() => shift.id),
  originalStaffId: integer("original_staff_id").notNull().references(() => staff.id),
  replacementStaffId: integer("replacement_staff_id").references(() => staff.id),
  calledOutAt: text("called_out_at").default(sql`(datetime('now'))`),
  reason: text("reason"),
  resolved: integer("resolved", { mode: "boolean" }).default(false),
});

export const shiftTemplate = sqliteTable("shift_template", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: integer("student_id").notNull().references(() => student.id),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  shiftType: text("shift_type").default("regular"),
  activityType: text("activity_type").default("general"),
  needsSwimSupport: integer("needs_swim_support", { mode: "boolean" }).default(false),
  notes: text("notes"),
});
