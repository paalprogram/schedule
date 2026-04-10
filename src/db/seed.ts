import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { createBackup } from "./backup";
import { getDbPath } from "../lib/db-utils";

const dbPath = getDbPath();

// ── Safety check: require --confirm to prevent accidental data loss ──
if (!process.argv.includes("--confirm")) {
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    console.error("\n  WARNING: This will DELETE ALL DATA in schedule.db");
    console.error(`  Database: ${dbPath} (${(stat.size / 1024).toFixed(1)} KB)`);
    console.error("\n  To proceed, run:  npm run db:seed -- --confirm");
    console.error("  To back up first: npm run db:backup\n");
    process.exit(1);
  }
}

// ── Auto-backup before wiping ──
const backupResult = createBackup("pre-seed");
if (backupResult) {
  console.log(`Auto-backup created: ${path.basename(backupResult)}`);
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

console.log(`Database: ${dbPath}`);

// Clear all data in dependency order
db.exec(`
  DELETE FROM meeting_attendee;
  DELETE FROM meeting;
  DELETE FROM callout;
  DELETE FROM shift;
  DELETE FROM shift_template;
  DELETE FROM staff_onboarding;
  DELETE FROM staff_student_preference;
  DELETE FROM staff_dedicated_role;
  DELETE FROM staff_student_training;
  DELETE FROM staff_availability;
  DELETE FROM staff_pto;
  DELETE FROM student_absence;
  DELETE FROM student_group_member;
  DELETE FROM student;
  DELETE FROM student_group;
  DELETE FROM staff;
`);

// ═══════════════════════════════════════════════════════════════
// STAFF — from the TEAMS sheet column headers (exact CSV data)
// ═══════════════════════════════════════════════════════════════

const insertStaff = db.prepare(`
  INSERT INTO staff (name, role, can_work_overnight, can_cover_swim, notes)
  VALUES (?, ?, ?, ?, ?)
`);

const directCareStaff: [string, number, number, string | null][] = [
  ["Abbigail",    0, 0, null],
  ["Alexis",      0, 0, null],
  ["Alisha",      0, 0, null],
  ["Alliah",      0, 1, "Swim certified"],
  ["Azim",        0, 0, null],
  ["Channing",    0, 0, null],
  ["Clare",       0, 0, null],
  ["Cori",        0, 0, null],
  ["Damola",      0, 0, null],
  ["Clarke",      0, 0, null],
  ["Courtney",    0, 0, null],
  ["Daniel",      0, 0, null],
  ["Demia",       0, 0, null],
  ["Dom",         0, 0, null],
  ["Elsie",       0, 0, null],
  ["Greg",        0, 0, null],
  ["Jerica",      0, 0, null],
  ["Jessica",     0, 0, null],
  ["Jimmy",       0, 0, null],
  ["Jon",         0, 0, null],
  ["Justice",     0, 0, null],
  ["Jutee",       0, 0, null],
  ["Ka.",         0, 0, null],
  ["Kaia",        0, 0, null],
  ["Kelly",       0, 0, null],
  ["Kevin B",     0, 1, "Swim certified"],
  ["Kirsten",     0, 0, null],
  ["Kristiann",   0, 0, null],
  ["Kyle",        0, 0, null],
  ["Kyra",        0, 0, null],
  ["Lauren",      0, 0, null],
  ["Layla",       0, 0, null],
  ["Mar",         0, 0, null],
  ["Matt",        0, 0, null],
  ["Millie",      0, 0, null],
  ["Parker",      0, 0, null],
  ["Shanice",     0, 0, null],
  ["Shawna",      0, 0, null],
  ["Taylor",      0, 0, "Academics lead"],
  ["Tella",       0, 0, null],
  ["Tom",         0, 1, "Swim certified"],
  ["Will",        0, 0, null],
  ["Wren",        0, 0, null],
  ["Zakiyah",     0, 0, null],
];

for (const [name, overnight, swim, notes] of directCareStaff) {
  insertStaff.run(name, "direct_care", overnight, swim, notes);
}

const supervisorStaff: [string, string, string | null][] = [
  ["Ben",       "lead",       "Crisis Support"],
  ["Jason K",   "supervisor", null],
  ["JNFR",      "lead",       null],
  ["Jason E",   "supervisor", null],
  ["Jennifer",  "lead",       null],
  ["Allen",     "supervisor", null],
  ["Katie",     "supervisor", null],
  ["Laura",     "lead",       null],
  ["Carole",    "supervisor", null],
  ["Ally",      "lead",       null],
  ["Kaitlin",   "lead",       "Swim lead"],
  ["McKeen",    "supervisor", null],
];

for (const [name, role, notes] of supervisorStaff) {
  insertStaff.run(name, role, 0, 0, notes);
}

// Build staff name→id lookup
const staffRows = db.prepare("SELECT id, name FROM staff").all() as Array<{ id: number; name: string }>;
const sid: Record<string, number> = {};
for (const r of staffRows) sid[r.name] = r.id;

// ═══════════════════════════════════════════════════════════════
// STUDENTS
// ═══════════════════════════════════════════════════════════════

const insertStudent = db.prepare(`
  INSERT INTO student (name, requires_swim_support, staffing_ratio, notes)
  VALUES (?, ?, ?, ?)
`);

const studentData: [string, number, number, string | null][] = [
  ["Nick",      0, 1, "Massage on Tuesdays"],
  ["Liz",       0, 1, null],
  ["AJ",        0, 1, null],
  ["Nicole",    0, 1, null],
  ["Chris W",   0, 1, null],
  ["Rose C",    0, 1, null],
  ["Will",      0, 1, null],
  ["Jonah",     0, 1, null],
  ["Matthew",   0, 1, null],
  ["Kelly B.",  0, 1, null],
  ["Andrew",    1, 1, "SWIM on Thursdays"],
  ["Kiki",      0, 1, null],
  ["Nya",       0, 1, null],
  ["Adam",      0, 1, null],
  ["Josh G",    1, 1, "SWIM on Wednesdays"],
  ["Trevor",    0, 1, null],
  ["Gavin",     0, 1, "See Kaitlin/Swim some days"],
  ["Chris M",   0, 1, null],
  ["Declan",    0, 1, null],
  ["Leo",       0, 1, null],
  ["Josh C",    0, 1, "Frequently OUT"],
  ["Bobby",     0, 1, null],
  ["Robert",    0, 1, null],
  ["Angela",    0, 1, null],
  ["Kyler",     0, 1, null],
  ["Tristan",   0, 1, null],
  ["Chris F",   0, 1, null],
  ["Kieran",    0, 2, null],
  ["Ben",       0, 2, null],
  ["Rose W",    0, 1, null],
  ["David",     0, 2, "Shares staff with Jack"],
  ["Jack",      0, 2, "Shares staff with David"],
  ["Pack",      0, 1, null],
];

for (const [name, swim, ratio, notes] of studentData) {
  insertStudent.run(name, swim, ratio, notes);
}

// Build student name→id lookup
const studentRows = db.prepare("SELECT id, name FROM student").all() as Array<{ id: number; name: string }>;
const stid: Record<string, number> = {};
for (const r of studentRows) stid[r.name] = r.id;

// ═══════════════════════════════════════════════════════════════
// STUDENT GROUP — Joey, Zach, Jae & Jamie
// ═══════════════════════════════════════════════════════════════

const groupStudents = ["Joey", "Zach", "Jae", "Jamie"];
for (const name of groupStudents) {
  insertStudent.run(name, 0, 1, "Part of group: Joey, Zach, Jae & Jamie");
}
const allStudents = db.prepare("SELECT id, name FROM student").all() as Array<{ id: number; name: string }>;
for (const r of allStudents) stid[r.name] = r.id;

const insertGroup = db.prepare("INSERT INTO student_group (name, staffing_ratio, notes) VALUES (?, ?, ?)");
const groupResult = insertGroup.run("Joey, Zach, Jae & Jamie", 2, "Group scheduled together — always 2 staff");
const groupId = groupResult.lastInsertRowid;

const insertGroupMember = db.prepare("INSERT INTO student_group_member (group_id, student_id) VALUES (?, ?)");
const updateStudentGroup = db.prepare("UPDATE student SET group_id = ? WHERE id = ?");
for (const name of groupStudents) {
  insertGroupMember.run(groupId, stid[name]);
  updateStudentGroup.run(groupId, stid[name]);
}

// ═══════════════════════════════════════════════════════════════
// TRAINING — parsed directly from the Google Sheets CSV export
// Each key = staff column header, value = students listed below
// Parsed exactly from the CSV, column by column
// ═══════════════════════════════════════════════════════════════

const insertTraining = db.prepare(`
  INSERT OR IGNORE INTO staff_student_training (staff_id, student_id, approved, certified_date)
  VALUES (?, ?, 1, '2026-01-15')
`);

// Normalize student names from the CSV to match our DB names
function norm(name: string): string {
  const n = name.trim();
  // Map CSV names to our DB student names
  if (n === "Kelly") return "Kelly B.";
  if (n === "Tristian") return "Tristan";
  if (n === "Keiran") return "Kieran";
  if (n === "Aj") return "AJ";
  if (n === "PACK") return "Pack";
  if (n === "Rose W") return "Rose W";
  if (n === "Rose C") return "Rose C";
  return n;
}

// ── Table 1: columns parsed from CSV rows 3-10 ──
const trainingMap: Record<string, string[]> = {
  // Column A: Abbigail
  "Abbigail": ["Gavin", "Chris F", "Trevor", "Kiki", "Josh C", "Kelly", "Chris F"],

  // Column B: Alisha
  "Alisha": ["Angela", "Nicole", "Bobby", "Kiki", "Josh C", "Kelly", "Liz", "Chris F"],

  // Column C: Alliah
  "Alliah": ["Leo", "Adam", "Kelly", "Andrew", "Jonah", "Liz", "Declan"],

  // Column D: Azim
  "Azim": ["Nick", "Chris W", "Adam", "Will", "Trevor", "Declan", "Nicole"],

  // Column E: Channing
  "Channing": ["Rose C", "Josh C", "Kiki", "Nya", "PACK", "Nicole", "Liz"],

  // Column F: Clare
  "Clare": ["Angela", "Kelly", "Trevor", "PACK", "Liz", "Nicole"],

  // Column G: Cori — no entries
  "Cori": [],

  // Column H: Damola — no entries
  "Damola": [],

  // Column I: Clarke
  "Clarke": ["Josh G", "Leo", "Andrew", "Tristian", "Gavin", "Chris F", "Nick", "Aj"],

  // Column J: Daniel
  "Daniel": ["Adam", "Gavin", "Matthew", "Keiran"],

  // Column K: Demia
  "Demia": ["Pack", "Kiki", "Kyler", "Nicole", "Liz"],

  // Column L: Dom
  "Dom": ["Nya", "Kiki", "Kyler", "Bobby", "Liz", "Nicole"],

  // Column M: Elsie
  "Elsie": ["Adam", "Will", "Kyler", "Chris M"],

  // Column N: Greg
  "Greg": ["Matthew", "Will", "Kelly", "Liz", "Jonah"],

  // Column O: Jerica (header blue = Nicole)
  "Jerica": ["Nicole", "Rose C", "Chris F", "Liz", "Kyler", "Angela"],

  // Column P: Jessica
  "Jessica": ["Bobby", "Robert", "Tristian", "Ben", "Declan", "Angela"],

  // Column Q: Jon
  "Jon": ["Leo", "Nick", "Josh G", "Tristian", "Chris M"],

  // Column R: Justice
  "Justice": ["Tristian", "Chris M", "Pack", "Josh G"],

  // Column S: Jutee
  "Jutee": ["Chris W", "Nya", "Rose W", "Pack", "Nicole", "Liz"],

  // Column T: Ka
  "Ka.": ["Adam", "Angela", "Kieran", "Rose W", "Kyler", "Chris W", "Liz", "Nicole", "Will"],

  // Column U: Kelly
  "Kelly": ["Kelly", "Jonah", "Tristian", "Rose C", "Ben", "Trevor", "Nicole", "Liz", "Nicole"],

  // Column V: Kevin B
  "Kevin B": ["Josh G", "Ben", "Tristian", "Chris M", "Kieran", "AJ"],

  // ── Table 2: columns parsed from CSV rows 13-19 ──

  // Kirsten
  "Kirsten": ["Rose C", "Jack", "David", "Matthew", "Trevor"],

  // Kristiann
  "Kristiann": ["Josh C", "Angela", "Bobby", "Nicole", "Liz"],

  // Kyra
  "Kyra": ["Kelly", "Nicole", "Matthew", "Declan"],

  // Layla
  "Layla": ["Bobby", "Robert", "Gavin", "Kyler"],

  // Lauren
  "Lauren": ["Angela", "Jack", "David", "Matthew", "Kieran", "Will"],

  // Mar
  "Mar": ["Gavin", "AJ", "Rose C", "Pack", "Kieran", "Matthew", "Will", "Nick", "Aj"],

  // Matt
  "Matt": ["Kieran", "Tristan", "Jack", "David", "Gavin", "Matthew", "Nick"],

  // Millie
  "Millie": ["Robert", "AJ", "Kieran", "Declan", "Nick"],

  // Parker
  "Parker": ["Ben", "Leo", "Kieran", "Andrew", "Josh G", "Nick", "Aj"],

  // Shanice
  "Shanice": ["Nya", "Rose C", "Will", "Jonah", "Nick"],

  // Shawna
  "Shawna": ["Robert", "Bobby", "Jonah", "Chris F", "Josh C", "Nick"],

  // Tella
  "Tella": ["Angela", "Jonah", "Chris F", "Trevor", "Chris M", "AJ", "Nick"],

  // Tom
  "Tom": ["Andrew", "Leo", "Josh G", "Chris M", "Chris F", "AJ", "Nick", "Josh C"],

  // Wren
  "Wren": ["Adam", "Kyler", "Robert", "Chris F", "Nick"],

  // Will (staff)
  "Will": ["Tristian", "Ben", "Andrew", "Kyler", "Nick"],

  // Zakiyah
  "Zakiyah": ["Chris F", "Will", "Kyler", "Kieran", "Nick"],

  // Alexis
  "Alexis": ["Robert", "Kyler", "Kieran"],

  // Courtney
  "Courtney": ["Pack", "Trevor", "Jack", "David", "Rose C", "Tristan", "Chris W"],

  // Jennifer
  "Jennifer": ["Rose W", "Jack", "David", "Rose C", "Chris W"],

  // Jimmy
  "Jimmy": ["AJ", "Chris F", "Tristan", "Declan"],

  // Kyle
  "Kyle": ["Aj", "Ben", "Declan", "Matthew", "Andrew", "Nick"],

  // McKeen
  "McKeen": ["AJ", "Chris W", "Matthew", "Nick"],
};

let trainingCount = 0;
let trainingWarnings = 0;
for (const [staffName, students] of Object.entries(trainingMap)) {
  const sId = sid[staffName];
  if (!sId) { console.warn(`  WARN: Staff "${staffName}" not found`); trainingWarnings++; continue; }

  // Deduplicate student list
  const seen = new Set<string>();
  for (const rawName of students) {
    const studentName = norm(rawName);
    if (seen.has(studentName)) continue;
    seen.add(studentName);

    // Handle "Jack / David" → train on both
    if (studentName === "Jack / David") {
      for (const name of ["Jack", "David"]) {
        if (stid[name]) { insertTraining.run(sId, stid[name]); trainingCount++; }
      }
      continue;
    }

    const stuId = stid[studentName];
    if (!stuId) { console.warn(`  WARN: Student "${rawName}" → "${studentName}" not found for staff "${staffName}"`); trainingWarnings++; continue; }
    insertTraining.run(sId, stuId);
    trainingCount++;
  }
}

// ═══════════════════════════════════════════════════════════════
// STAFF AVAILABILITY — Mon-Fri 7:00-15:00 for all active staff
// ═══════════════════════════════════════════════════════════════

const insertAvail = db.prepare(
  "INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)"
);
const activeStaff = db.prepare("SELECT id FROM staff WHERE active = 1").all() as Array<{ id: number }>;
for (const s of activeStaff) {
  for (let day = 1; day <= 5; day++) {
    insertAvail.run(s.id, day, "07:00", "15:00");
  }
}

// ═══════════════════════════════════════════════════════════════
// SHIFT TEMPLATES — Mon-Fri daily shift for every student
// ═══════════════════════════════════════════════════════════════

const insertTemplate = db.prepare(`
  INSERT INTO shift_template (student_id, day_of_week, start_time, end_time, shift_type, activity_type, needs_swim_support)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const everyStudent = db.prepare("SELECT id FROM student WHERE active = 1").all() as Array<{ id: number }>;
for (const s of everyStudent) {
  for (let day = 1; day <= 5; day++) {
    insertTemplate.run(s.id, day, "08:00", "14:00", "regular", "general", 0);
  }
}
insertTemplate.run(stid["Andrew"], 4, "10:00", "11:00", "regular", "swimming", 1);
insertTemplate.run(stid["Josh G"], 3, "10:00", "11:00", "regular", "swimming", 1);
insertTemplate.run(stid["Nick"], 2, "09:00", "10:00", "regular", "massage", 0);

// ═══════════════════════════════════════════════════════════════
// DEDICATED ROLES
// ═══════════════════════════════════════════════════════════════

const insertDedicated = db.prepare(`
  INSERT INTO staff_dedicated_role (staff_id, role, label, day_of_week, notes) VALUES (?, ?, ?, ?, ?)
`);
insertDedicated.run(sid["Taylor"], "academics", "Academics", null, "Academics lead all week");
insertDedicated.run(sid["Ben"], "crisis_support", "Crisis Support", null, "Crisis support all week");

// ═══════════════════════════════════════════════════════════════
// PTO — from the spreadsheet "Scheduled OFF" and "OUT" rows
// ═══════════════════════════════════════════════════════════════

const insertPto = db.prepare(
  "INSERT INTO staff_pto (staff_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)"
);
insertPto.run(sid["Jon"],       "2026-03-23", "2026-03-25", "Scheduled OFF");
insertPto.run(sid["Laura"],     "2026-03-23", "2026-03-23", "Scheduled OFF");
insertPto.run(sid["Jerica"],    "2026-03-23", "2026-03-23", "Scheduled OFF");
insertPto.run(sid["Jason E"],   "2026-03-26", "2026-03-26", "Scheduled OFF");
insertPto.run(sid["Kyle"],      "2026-03-26", "2026-03-27", "Scheduled OFF");
insertPto.run(sid["JNFR"],      "2026-03-27", "2026-03-27", "Scheduled OFF");
insertPto.run(sid["Channing"],  "2026-03-27", "2026-03-27", "Scheduled OFF");
insertPto.run(sid["Lauren"],    "2026-03-27", "2026-03-27", "Scheduled OFF");
insertPto.run(sid["Courtney"],  "2026-03-27", "2026-03-27", "Scheduled OFF");
insertPto.run(sid["Jennifer"],  "2026-03-27", "2026-03-27", "Scheduled OFF");
insertPto.run(sid["Parker"],    "2026-03-27", "2026-03-27", "Scheduled OFF");
insertPto.run(sid["Daniel"],    "2026-03-27", "2026-03-27", "Scheduled OFF");
insertPto.run(sid["Layla"],     "2026-03-23", "2026-03-24", "OUT");
insertPto.run(sid["Matt"],      "2026-03-24", "2026-03-24", "OUT");
insertPto.run(sid["Allen"],     "2026-03-24", "2026-03-24", "OUT");

// ═══════════════════════════════════════════════════════════════
// STUDENT ABSENCES
// ═══════════════════════════════════════════════════════════════

const insertAbsence = db.prepare(
  "INSERT INTO student_absence (student_id, date, reason) VALUES (?, ?, ?)"
);
for (const date of ["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27"]) {
  insertAbsence.run(stid["Josh C"], date, "OUT all week");
}
insertAbsence.run(stid["Nya"], "2026-03-25", "OUT");
insertAbsence.run(stid["Nya"], "2026-03-26", "OUT");
insertAbsence.run(stid["Nya"], "2026-03-27", "OUT");
insertAbsence.run(stid["Adam"], "2026-03-26", "OUT");
insertAbsence.run(stid["Adam"], "2026-03-27", "OUT");
insertAbsence.run(stid["Kelly B."], "2026-03-27", "OUT");
insertAbsence.run(stid["Gavin"], "2026-03-27", "OUT");
insertAbsence.run(stid["Angela"], "2026-03-23", "OUT");

// ═══════════════════════════════════════════════════════════════
// MEETINGS
// ═══════════════════════════════════════════════════════════════

const insertMeeting = db.prepare(`
  INSERT INTO meeting (title, meeting_type, date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?)
`);
insertMeeting.run("Declan 8:15am (Paal prep)", "team_meeting", "2026-03-24", "08:15", "09:00", null);
insertMeeting.run("All Staff Meeting 8:15 - 3rd Fl", "team_meeting", "2026-03-25", "08:15", "09:00", "3rd Floor");
insertMeeting.run("Kyler 8:15am (Paal prep)", "team_meeting", "2026-03-26", "08:15", "09:00", null);
for (const [title, date] of [
  ["Analysis Meeting: Angela", "2026-03-23"],
  ["Analysis Meeting: Leo", "2026-03-24"],
  ["Analysis Meeting: Zach", "2026-03-25"],
  ["Analysis Meeting: Tristan", "2026-03-26"],
  ["Analysis Meeting: Josh G", "2026-03-27"],
] as [string, string][]) {
  insertMeeting.run(title, "analysis_meeting", date, "08:00", "08:30", null);
}

// ═══════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════

const insertOnboarding = db.prepare(`
  INSERT INTO staff_onboarding (staff_id, student_id, current_day, total_days, scheduled_date, notes)
  VALUES (?, ?, ?, ?, ?, ?)
`);
insertOnboarding.run(sid["Daniel"],   stid["Matthew"], 3, 3, "2026-03-23", "Day 3");
insertOnboarding.run(sid["Greg"],     stid["Matthew"], 1, 3, "2026-03-24", "First Day");
insertOnboarding.run(sid["Lauren"],   stid["Matthew"], 1, 3, "2026-03-25", "First Day");
insertOnboarding.run(sid["Alisha"],   stid["Bobby"],   3, 3, "2026-03-23", "Day 3");
insertOnboarding.run(sid["Shawna"],   stid["Bobby"],   1, 3, "2026-03-25", "First day");
insertOnboarding.run(sid["Kirsten"],  stid["Trevor"],  1, 3, "2026-03-26", "Day 1");
insertOnboarding.run(sid["Tella"],    stid["Trevor"],  2, 3, "2026-03-27", "Day 2");
insertOnboarding.run(sid["Wren"],     stid["Chris F"], 3, 3, "2026-03-23", "Day 3");
insertOnboarding.run(sid["Abbigail"], stid["Chris F"], 1, 3, "2026-03-25", "First day");
insertOnboarding.run(sid["Wren"],     stid["Chris F"], 2, 3, "2026-03-27", "Day 2");
insertOnboarding.run(sid["Mar"],      stid["Kieran"],  2, 3, "2026-03-26", "Day 2");
insertOnboarding.run(sid["Kelly"],    stid["Kieran"],  3, 3, "2026-03-27", "Day 3");
insertOnboarding.run(sid["Kyra"],     stid["Declan"],  2, 3, "2026-03-24", "In @10:30 / Day 2");
insertOnboarding.run(sid["Kyle"],     stid["Declan"],  3, 3, "2026-03-25", "Day 3");
insertOnboarding.run(sid["Jon"],      stid["Declan"],  3, 3, "2026-03-27", "Day 3");
insertOnboarding.run(sid["Alisha"],   stid["Angela"],  3, 3, "2026-03-24", "Day 3");
insertOnboarding.run(sid["Jessica"],  stid["Angela"],  1, 3, "2026-03-25", "First day");
insertOnboarding.run(sid["Alexis"],   stid["Kieran"],  1, 3, "2026-03-26", "First day");

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════

const c = (table: string) => (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;

console.log("\nSeed data inserted successfully!");
console.log(`  ${c("staff")} staff members (${directCareStaff.length} direct care + ${supervisorStaff.length} supervisors/leads)`);
console.log(`  ${c("student")} students`);
console.log(`  ${c("student_group")} student group`);
console.log(`  ${c("staff_student_training")} training records`);
console.log(`  ${c("shift_template")} shift templates`);
console.log(`  ${c("staff_pto")} PTO entries`);
console.log(`  ${c("student_absence")} student absences`);
console.log(`  ${c("meeting")} meetings`);
console.log(`  ${c("staff_onboarding")} onboarding records`);
console.log(`  ${c("staff_dedicated_role")} dedicated roles`);
if (trainingWarnings > 0) console.log(`  ${trainingWarnings} warnings (see above)`);

db.close();
