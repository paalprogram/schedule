import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "schedule.db");
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

// Clear existing data
db.exec(`
  DELETE FROM callout;
  DELETE FROM shift;
  DELETE FROM shift_template;
  DELETE FROM staff_student_training;
  DELETE FROM staff_availability;
  DELETE FROM staff_pto;
  DELETE FROM student;
  DELETE FROM staff;
`);

// ── Staff (10 members) ──
const insertStaff = db.prepare(`
  INSERT INTO staff (name, role, can_work_overnight, can_cover_swim, max_hours_per_week, notes)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const staffData = [
  ["Maria Johnson", "lead", 0, 1, 40, "Lead staff, swim certified"],
  ["James Carter", "direct_care", 1, 0, 40, "Overnight specialist"],
  ["Aisha Patel", "direct_care", 0, 1, 35, "Great with younger students, swim certified"],
  ["David Kim", "direct_care", 1, 1, 40, "Flexible schedule, swim and overnight"],
  ["Sarah Williams", "direct_care", 0, 0, 30, "Part-time, afternoons preferred"],
  ["Marcus Brown", "lead", 0, 1, 40, "Senior lead, swim certified"],
  ["Emily Chen", "direct_care", 0, 0, 40, null],
  ["Robert Taylor", "direct_care", 1, 0, 40, "Overnight preferred"],
  ["Jessica Martinez", "direct_care", 0, 1, 35, "Swim certified"],
  ["Anthony Davis", "supervisor", 0, 0, 40, "Supervisor - can fill in when needed"],
];

for (const s of staffData) {
  insertStaff.run(...s);
}

// ── Students (6) ──
const insertStudent = db.prepare(`
  INSERT INTO student (name, requires_swim_support, notes)
  VALUES (?, ?, ?)
`);

const studentData = [
  ["Ethan R.", 1, "Needs swim support on Wednesdays"],
  ["Olivia M.", 0, "Prefers consistent staffing"],
  ["Liam S.", 1, "Swim Tuesdays and Thursdays"],
  ["Sophia T.", 0, null],
  ["Noah W.", 0, "Responds well to familiar staff"],
  ["Ava P.", 1, "Swim on Fridays, needs 1:1 in water"],
];

for (const s of studentData) {
  insertStudent.run(...s);
}

// ── Training assignments ──
// Each student has 4-6 trained staff; not all staff trained on all students
const insertTraining = db.prepare(`
  INSERT INTO staff_student_training (staff_id, student_id, approved, certified_date)
  VALUES (?, ?, 1, '2026-01-15')
`);

const trainingMap: Record<number, number[]> = {
  1: [1, 2, 3, 4, 6, 9],       // Ethan: Maria, James, Aisha, David, Marcus, Jessica
  2: [1, 3, 5, 7, 10],          // Olivia: Maria, Aisha, Sarah, Emily, Anthony
  3: [2, 4, 6, 8, 9],           // Liam: James, David, Marcus, Robert, Jessica
  4: [1, 3, 5, 7, 8, 10],       // Sophia: Maria, Aisha, Sarah, Emily, Robert, Anthony
  5: [2, 4, 6, 7, 9],           // Noah: James, David, Marcus, Emily, Jessica
  6: [1, 3, 4, 6, 9, 10],       // Ava: Maria, Aisha, David, Marcus, Jessica, Anthony
};

for (const [studentId, staffIds] of Object.entries(trainingMap)) {
  for (const staffId of staffIds) {
    insertTraining.run(staffId, parseInt(studentId));
  }
}

// ── Staff availability (Mon-Fri for most, some with restricted hours) ──
const insertAvail = db.prepare(`
  INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time)
  VALUES (?, ?, ?, ?)
`);

// Most staff: Mon-Fri 7:00-15:00
for (const staffId of [1, 2, 3, 4, 6, 7, 8, 9, 10]) {
  for (let day = 1; day <= 5; day++) {
    insertAvail.run(staffId, day, "07:00", "15:00");
  }
}

// Sarah (5): Mon-Fri 11:00-17:00 (part-time afternoons)
for (let day = 1; day <= 5; day++) {
  insertAvail.run(5, day, "11:00", "17:00");
}

// Overnight staff also available evenings
for (const staffId of [2, 4, 8]) {
  for (let day = 1; day <= 5; day++) {
    insertAvail.run(staffId, day, "21:00", "07:00");
  }
}

// ── PTO ──
const insertPto = db.prepare(`
  INSERT INTO staff_pto (staff_id, start_date, end_date, reason)
  VALUES (?, ?, ?, ?)
`);

insertPto.run(3, "2026-04-13", "2026-04-14", "Personal day");
insertPto.run(7, "2026-04-15", "2026-04-17", "Family vacation");

// ── Shift templates (recurring weekly needs) ──
const insertTemplate = db.prepare(`
  INSERT INTO shift_template (student_id, day_of_week, start_time, end_time, shift_type, activity_type, needs_swim_support)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// Each student gets daily shifts Mon-Fri
for (let studentId = 1; studentId <= 6; studentId++) {
  for (let day = 1; day <= 5; day++) {
    insertTemplate.run(studentId, day, "08:00", "14:00", "regular", "general", 0);
  }
}

// Swim shifts
insertTemplate.run(1, 3, "10:00", "11:00", "regular", "swimming", 1); // Ethan Wed
insertTemplate.run(3, 2, "10:00", "11:00", "regular", "swimming", 1); // Liam Tue
insertTemplate.run(3, 4, "10:00", "11:00", "regular", "swimming", 1); // Liam Thu
insertTemplate.run(6, 5, "10:00", "11:00", "regular", "swimming", 1); // Ava Fri

// Overnight shift for Liam
insertTemplate.run(3, 1, "21:00", "07:00", "overnight", "general", 0); // Liam Mon night
insertTemplate.run(3, 3, "21:00", "07:00", "overnight", "general", 0); // Liam Wed night

// ── Sample shifts for week of April 13, 2026 (Mon-Fri) ──
const insertShift = db.prepare(`
  INSERT INTO shift (student_id, assigned_staff_id, date, start_time, end_time, shift_type, activity_type, needs_swim_support, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const weekDates = ["2026-04-13", "2026-04-14", "2026-04-15", "2026-04-16", "2026-04-17"];

// Assign regular daily shifts
const dailyAssignments: [number, number, number][] = [
  // [studentId, staffId, dayIndex]
  // Monday
  [1, 1, 0], [2, 3, 0], [3, 4, 0], [4, 5, 0], [5, 6, 0], [6, 9, 0],
  // Tuesday
  [1, 4, 1], [2, 1, 1], [3, 6, 1], [4, 7, 1], [5, 2, 1], [6, 3, 1],
  // Wednesday
  [1, 6, 2], [2, 5, 2], [3, 2, 2], [4, 8, 2], [5, 4, 2], [6, 1, 2],
  // Thursday
  [1, 9, 3], [2, 3, 3], [3, 4, 3], [4, 1, 3], [5, 6, 3], [6, 10, 3],
  // Friday
  [1, 2, 4], [2, 7, 4], [3, 8, 4], [4, 3, 4], [5, 9, 4], [6, 4, 4],
];

for (const [studentId, staffId, dayIdx] of dailyAssignments) {
  insertShift.run(studentId, staffId, weekDates[dayIdx], "08:00", "14:00", "regular", "general", 0, "scheduled");
}

// Swim shifts
insertShift.run(1, 1, "2026-04-15", "10:00", "11:00", "regular", "swimming", 1, "scheduled"); // Ethan Wed - Maria
insertShift.run(3, 9, "2026-04-14", "10:00", "11:00", "regular", "swimming", 1, "scheduled"); // Liam Tue - Jessica
insertShift.run(3, 4, "2026-04-16", "10:00", "11:00", "regular", "swimming", 1, "scheduled"); // Liam Thu - David
insertShift.run(6, 6, "2026-04-17", "10:00", "11:00", "regular", "swimming", 1, "scheduled"); // Ava Fri - Marcus

// Overnight shifts
insertShift.run(3, 2, "2026-04-13", "21:00", "07:00", "overnight", "general", 0, "scheduled"); // Liam Mon - James
insertShift.run(3, 8, "2026-04-15", "21:00", "07:00", "overnight", "general", 0, "scheduled"); // Liam Wed - Robert

// One callout scenario: Emily called out Thursday
const calloutShiftId = dailyAssignments.findIndex(([s, st, d]) => st === 7 && d === 3);
// Emily (7) isn't assigned Thursday in our data, so let's create a callout on Tuesday for Emily
// Emily is assigned student 4 (Sophia) on Tuesday
insertShift.run(4, null, "2026-04-14", "08:00", "14:00", "regular", "general", 0, "open");

const insertCallout = db.prepare(`
  INSERT INTO callout (shift_id, original_staff_id, reason, resolved)
  VALUES (?, ?, ?, ?)
`);

// Get the last inserted shift id for the open one
const lastShift = db.prepare("SELECT MAX(id) as id FROM shift WHERE status = 'open'").get() as { id: number };
// The Tuesday Sophia shift with Emily was assigned - let's update it
// Actually let's make one of the existing shifts a callout
const tuesdaySophia = db.prepare(
  "SELECT id FROM shift WHERE student_id = 4 AND date = '2026-04-14' AND assigned_staff_id = 7"
).get() as { id: number } | undefined;

if (tuesdaySophia) {
  db.prepare("UPDATE shift SET status = 'called_out', assigned_staff_id = NULL WHERE id = ?").run(tuesdaySophia.id);
  insertCallout.run(tuesdaySophia.id, 7, "Sick - called out morning of", 0);
}

console.log("Seed data inserted successfully!");
console.log("  - 10 staff members");
console.log("  - 6 students");
console.log("  - Training assignments mapped");
console.log("  - Availability set for all staff");
console.log("  - 2 PTO entries");
console.log("  - Shift templates for recurring needs");
console.log("  - Sample shifts for week of April 13, 2026");
console.log("  - 1 callout scenario");

db.close();
