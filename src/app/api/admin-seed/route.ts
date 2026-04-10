import { NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";

export async function POST() {
  const db = getDb();

  // Clear all data
  db.exec(`
    DELETE FROM meeting_attendee; DELETE FROM meeting; DELETE FROM callout;
    DELETE FROM shift; DELETE FROM shift_template; DELETE FROM staff_onboarding;
    DELETE FROM staff_student_preference; DELETE FROM staff_dedicated_role;
    DELETE FROM staff_student_training; DELETE FROM staff_availability;
    DELETE FROM staff_pto; DELETE FROM student_absence;
    DELETE FROM student_group_member; DELETE FROM student;
    DELETE FROM student_group; DELETE FROM staff;
  `);

  // ── STAFF ──
  const iS = db.prepare("INSERT INTO staff (name, role, can_work_overnight, can_cover_swim, notes) VALUES (?, ?, ?, ?, ?)");
  const dc: [string,number,number,string|null][] = [
    ["Abbigail",0,0,null],["Alexis",0,0,null],["Alisha",0,0,null],["Alliah",0,1,"Swim certified"],
    ["Azim",0,0,null],["Channing",0,0,null],["Clare",0,0,null],["Cori",0,0,null],["Damola",0,0,null],
    ["Clarke",0,0,null],["Courtney",0,0,null],["Daniel",0,0,null],["Demia",0,0,null],["Dom",0,0,null],
    ["Elsie",0,0,null],["Greg",0,0,null],["Jerica",0,0,null],["Jessica",0,0,null],["Jimmy",0,0,null],
    ["Jon",0,0,null],["Justice",0,0,null],["Jutee",0,0,null],["Ka.",0,0,null],["Kaia",0,0,null],
    ["Kelly",0,0,null],["Kevin B",0,1,"Swim certified"],["Kirsten",0,0,null],["Kristiann",0,0,null],
    ["Kyle",0,0,null],["Kyra",0,0,null],["Lauren",0,0,null],["Layla",0,0,null],["Mar",0,0,null],
    ["Matt",0,0,null],["Millie",0,0,null],["Parker",0,0,null],["Shanice",0,0,null],["Shawna",0,0,null],
    ["Taylor",0,0,"Academics lead"],["Tella",0,0,null],["Tom",0,1,"Swim certified"],["Will",0,0,null],
    ["Wren",0,0,null],["Zakiyah",0,0,null],
  ];
  for (const [n,o,s,no] of dc) iS.run(n,"direct_care",o,s,no);
  const sv: [string,string,string|null][] = [
    ["Ben","lead","Crisis Support"],["Jason K","supervisor",null],["JNFR","lead",null],
    ["Jason E","supervisor",null],["Jennifer","lead",null],["Allen","supervisor",null],
    ["Katie","supervisor",null],["Laura","lead",null],["Carole","supervisor",null],
    ["Ally","lead",null],["Kaitlin","lead","Swim lead"],["McKeen","supervisor",null],
  ];
  for (const [n,r,no] of sv) iS.run(n,r,0,0,no);

  const sid: Record<string,number> = {};
  for (const r of db.prepare("SELECT id,name FROM staff").all() as {id:number;name:string}[]) sid[r.name]=r.id;

  // ── STUDENTS ──
  const iSt = db.prepare("INSERT INTO student (name, requires_swim_support, staffing_ratio, notes) VALUES (?, ?, ?, ?)");
  const stu: [string,number,number,string|null][] = [
    ["Nick",0,1,"Massage on Tuesdays"],["Liz",0,1,null],["AJ",0,1,null],["Nicole",0,1,null],
    ["Chris W",0,1,null],["Rose C",0,1,null],["Will",0,1,null],["Jonah",0,1,null],["Matthew",0,1,null],
    ["Kelly B.",0,1,null],["Andrew",1,1,"SWIM on Thursdays"],["Kiki",0,1,null],["Nya",0,1,null],
    ["Adam",0,1,null],["Josh G",1,1,"SWIM on Wednesdays"],["Trevor",0,1,null],
    ["Gavin",0,1,"See Kaitlin/Swim some days"],["Chris M",0,1,null],["Declan",0,1,null],["Leo",0,1,null],
    ["Josh C",0,1,"Frequently OUT"],["Bobby",0,1,null],["Robert",0,1,null],["Angela",0,1,null],
    ["Kyler",0,1,null],["Tristan",0,1,null],["Chris F",0,1,null],["Kieran",0,2,null],["Ben",0,2,null],
    ["Rose W",0,1,null],["David",0,2,"Shares staff with Jack"],["Jack",0,2,"Shares staff with David"],
    ["Pack",0,1,null],
  ];
  for (const [n,s,r,no] of stu) iSt.run(n,s,r,no);
  for (const n of ["Joey","Zach","Jae","Jamie"]) iSt.run(n,0,1,"Part of group: Joey, Zach, Jae & Jamie");

  const stid: Record<string,number> = {};
  for (const r of db.prepare("SELECT id,name FROM student").all() as {id:number;name:string}[]) stid[r.name]=r.id;

  // ── GROUP ──
  const gid = db.prepare("INSERT INTO student_group (name, staffing_ratio, notes) VALUES (?, ?, ?)").run("Joey, Zach, Jae & Jamie",2,"Group scheduled together").lastInsertRowid;
  for (const n of ["Joey","Zach","Jae","Jamie"]) {
    db.prepare("INSERT INTO student_group_member (group_id, student_id) VALUES (?, ?)").run(gid, stid[n]);
    db.prepare("UPDATE student SET group_id = ? WHERE id = ?").run(gid, stid[n]);
  }

  // ── TRAINING ──
  const iT = db.prepare("INSERT OR IGNORE INTO staff_student_training (staff_id, student_id, approved, certified_date) VALUES (?, ?, 1, '2026-01-15')");
  function nm(n:string){const t=n.trim();return t==="Kelly"?"Kelly B.":t==="Tristian"?"Tristan":t==="Keiran"?"Kieran":t==="Aj"?"AJ":t==="PACK"?"Pack":t;}
  const tm: Record<string,string[]> = {
    "Abbigail":["Gavin","Chris F","Trevor","Kiki","Josh C","Kelly"],
    "Alisha":["Angela","Nicole","Bobby","Kiki","Josh C","Kelly","Liz","Chris F"],
    "Alliah":["Leo","Adam","Kelly","Andrew","Jonah","Liz","Declan"],
    "Azim":["Nick","Chris W","Adam","Will","Trevor","Declan","Nicole"],
    "Channing":["Rose C","Josh C","Kiki","Nya","PACK","Nicole","Liz"],
    "Clare":["Angela","Kelly","Trevor","PACK","Liz","Nicole"],
    "Clarke":["Josh G","Leo","Andrew","Tristian","Gavin","Chris F","Nick","Aj"],
    "Daniel":["Adam","Gavin","Matthew","Keiran"],
    "Demia":["Pack","Kiki","Kyler","Nicole","Liz"],
    "Dom":["Nya","Kiki","Kyler","Bobby","Liz","Nicole"],
    "Elsie":["Adam","Will","Kyler","Chris M"],
    "Greg":["Matthew","Will","Kelly","Liz","Jonah"],
    "Jerica":["Nicole","Rose C","Chris F","Liz","Kyler","Angela"],
    "Jessica":["Bobby","Robert","Tristian","Ben","Declan","Angela"],
    "Jon":["Leo","Nick","Josh G","Tristian","Chris M"],
    "Justice":["Tristian","Chris M","Pack","Josh G"],
    "Jutee":["Chris W","Nya","Rose W","Pack","Nicole","Liz"],
    "Ka.":["Adam","Angela","Kieran","Rose W","Kyler","Chris W","Liz","Nicole","Will"],
    "Kelly":["Kelly","Jonah","Tristian","Rose C","Ben","Trevor","Nicole","Liz"],
    "Kevin B":["Josh G","Ben","Tristian","Chris M","Kieran","AJ"],
    "Kirsten":["Rose C","Jack","David","Matthew","Trevor"],
    "Kristiann":["Josh C","Angela","Bobby","Nicole","Liz"],
    "Kyra":["Kelly","Nicole","Matthew","Declan"],
    "Layla":["Bobby","Robert","Gavin","Kyler"],
    "Lauren":["Angela","Jack","David","Matthew","Kieran","Will"],
    "Mar":["Gavin","AJ","Rose C","Pack","Kieran","Matthew","Will","Nick"],
    "Matt":["Kieran","Tristan","Jack","David","Gavin","Matthew","Nick"],
    "Millie":["Robert","AJ","Kieran","Declan","Nick"],
    "Parker":["Ben","Leo","Kieran","Andrew","Josh G","Nick"],
    "Shanice":["Nya","Rose C","Will","Jonah","Nick"],
    "Shawna":["Robert","Bobby","Jonah","Chris F","Josh C","Nick"],
    "Tella":["Angela","Jonah","Chris F","Trevor","Chris M","AJ","Nick"],
    "Tom":["Andrew","Leo","Josh G","Chris M","Chris F","AJ","Nick","Josh C"],
    "Wren":["Adam","Kyler","Robert","Chris F","Nick"],
    "Will":["Tristian","Ben","Andrew","Kyler","Nick"],
    "Zakiyah":["Chris F","Will","Kyler","Kieran","Nick"],
    "Alexis":["Robert","Kyler","Kieran"],
    "Courtney":["Pack","Trevor","Jack","David","Rose C","Tristan","Chris W"],
    "Jennifer":["Rose W","Jack","David","Rose C","Chris W"],
    "Jimmy":["AJ","Chris F","Tristan","Declan"],
    "Kyle":["AJ","Ben","Declan","Matthew","Andrew","Nick"],
    "McKeen":["AJ","Chris W","Matthew","Nick"],
  };
  let tc = 0;
  for (const [sn, students] of Object.entries(tm)) {
    const s = sid[sn]; if (!s) continue;
    const seen = new Set<string>();
    for (const raw of students) { const n = nm(raw); if (seen.has(n)) continue; seen.add(n); const st = stid[n]; if (st) { iT.run(s, st); tc++; } }
  }

  // ── AVAILABILITY ──
  const iA = db.prepare("INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)");
  for (const s of db.prepare("SELECT id FROM staff WHERE active = 1").all() as {id:number}[])
    for (let d=1;d<=5;d++) iA.run(s.id, d, "07:00", "15:00");

  // ── TEMPLATES ──
  const iTpl = db.prepare("INSERT INTO shift_template (student_id, day_of_week, start_time, end_time, shift_type, activity_type, needs_swim_support) VALUES (?,?,?,?,?,?,?)");
  for (const s of db.prepare("SELECT id FROM student WHERE active = 1").all() as {id:number}[])
    for (let d=1;d<=5;d++) iTpl.run(s.id, d, "08:00", "14:00", "regular", "general", 0);
  iTpl.run(stid["Andrew"], 4, "10:00", "11:00", "regular", "swimming", 1);
  iTpl.run(stid["Josh G"], 3, "10:00", "11:00", "regular", "swimming", 1);
  iTpl.run(stid["Nick"], 2, "09:00", "10:00", "regular", "massage", 0);

  // ── DEDICATED ROLES ──
  const iD = db.prepare("INSERT INTO staff_dedicated_role (staff_id, role, label, day_of_week, notes) VALUES (?,?,?,?,?)");
  iD.run(sid["Taylor"], "academics", "Academics", null, "Academics lead all week");
  iD.run(sid["Ben"], "crisis_support", "Crisis Support", null, "Crisis support all week");

  // ── PTO ──
  const iP = db.prepare("INSERT INTO staff_pto (staff_id, start_date, end_date, reason) VALUES (?,?,?,?)");
  iP.run(sid["Jon"],"2026-03-23","2026-03-25","Scheduled OFF");
  iP.run(sid["Laura"],"2026-03-23","2026-03-23","Scheduled OFF");
  iP.run(sid["Jerica"],"2026-03-23","2026-03-23","Scheduled OFF");
  iP.run(sid["Jason E"],"2026-03-26","2026-03-26","Scheduled OFF");
  iP.run(sid["Kyle"],"2026-03-26","2026-03-27","Scheduled OFF");
  iP.run(sid["JNFR"],"2026-03-27","2026-03-27","Scheduled OFF");
  iP.run(sid["Channing"],"2026-03-27","2026-03-27","Scheduled OFF");
  iP.run(sid["Lauren"],"2026-03-27","2026-03-27","Scheduled OFF");
  iP.run(sid["Courtney"],"2026-03-27","2026-03-27","Scheduled OFF");
  iP.run(sid["Jennifer"],"2026-03-27","2026-03-27","Scheduled OFF");
  iP.run(sid["Parker"],"2026-03-27","2026-03-27","Scheduled OFF");
  iP.run(sid["Daniel"],"2026-03-27","2026-03-27","Scheduled OFF");
  iP.run(sid["Layla"],"2026-03-23","2026-03-24","OUT");
  iP.run(sid["Matt"],"2026-03-24","2026-03-24","OUT");
  iP.run(sid["Allen"],"2026-03-24","2026-03-24","OUT");

  // ── ABSENCES ──
  const iAb = db.prepare("INSERT INTO student_absence (student_id, date, reason) VALUES (?,?,?)");
  for (const d of ["2026-03-23","2026-03-24","2026-03-25","2026-03-26","2026-03-27"]) iAb.run(stid["Josh C"],d,"OUT all week");
  iAb.run(stid["Nya"],"2026-03-25","OUT"); iAb.run(stid["Nya"],"2026-03-26","OUT"); iAb.run(stid["Nya"],"2026-03-27","OUT");
  iAb.run(stid["Adam"],"2026-03-26","OUT"); iAb.run(stid["Adam"],"2026-03-27","OUT");
  iAb.run(stid["Kelly B."],"2026-03-27","OUT"); iAb.run(stid["Gavin"],"2026-03-27","OUT"); iAb.run(stid["Angela"],"2026-03-23","OUT");

  // ── MEETINGS ──
  const iM = db.prepare("INSERT INTO meeting (title, meeting_type, date, start_time, end_time, notes) VALUES (?,?,?,?,?,?)");
  iM.run("Declan 8:15am (Paal prep)","team_meeting","2026-03-24","08:15","09:00",null);
  iM.run("All Staff Meeting 8:15 - 3rd Fl","team_meeting","2026-03-25","08:15","09:00","3rd Floor");
  iM.run("Kyler 8:15am (Paal prep)","team_meeting","2026-03-26","08:15","09:00",null);
  for (const [t,d] of [["Analysis Meeting: Angela","2026-03-23"],["Analysis Meeting: Leo","2026-03-24"],["Analysis Meeting: Zach","2026-03-25"],["Analysis Meeting: Tristan","2026-03-26"],["Analysis Meeting: Josh G","2026-03-27"]])
    iM.run(t,"analysis_meeting",d,"08:00","08:30",null);

  // ── ONBOARDING ──
  const iO = db.prepare("INSERT INTO staff_onboarding (staff_id, student_id, current_day, total_days, scheduled_date, notes) VALUES (?,?,?,?,?,?)");
  iO.run(sid["Daniel"],stid["Matthew"],3,3,"2026-03-23","Day 3");
  iO.run(sid["Greg"],stid["Matthew"],1,3,"2026-03-24","First Day");
  iO.run(sid["Lauren"],stid["Matthew"],1,3,"2026-03-25","First Day");
  iO.run(sid["Alisha"],stid["Bobby"],3,3,"2026-03-23","Day 3");
  iO.run(sid["Shawna"],stid["Bobby"],1,3,"2026-03-25","First day");
  iO.run(sid["Kirsten"],stid["Trevor"],1,3,"2026-03-26","Day 1");
  iO.run(sid["Tella"],stid["Trevor"],2,3,"2026-03-27","Day 2");
  iO.run(sid["Wren"],stid["Chris F"],3,3,"2026-03-23","Day 3");
  iO.run(sid["Abbigail"],stid["Chris F"],1,3,"2026-03-25","First day");
  iO.run(sid["Wren"],stid["Chris F"],2,3,"2026-03-27","Day 2");
  iO.run(sid["Mar"],stid["Kieran"],2,3,"2026-03-26","Day 2");
  iO.run(sid["Kelly"],stid["Kieran"],3,3,"2026-03-27","Day 3");
  iO.run(sid["Kyra"],stid["Declan"],2,3,"2026-03-24","In @10:30 / Day 2");
  iO.run(sid["Kyle"],stid["Declan"],3,3,"2026-03-25","Day 3");
  iO.run(sid["Jon"],stid["Declan"],3,3,"2026-03-27","Day 3");
  iO.run(sid["Alisha"],stid["Angela"],3,3,"2026-03-24","Day 3");
  iO.run(sid["Jessica"],stid["Angela"],1,3,"2026-03-25","First day");
  iO.run(sid["Alexis"],stid["Kieran"],1,3,"2026-03-26","First day");

  const c = (t:string) => (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as {c:number}).c;
  const result = {
    staff: c("staff"), students: c("student"), training: tc,
    templates: c("shift_template"), pto: c("staff_pto"),
    absences: c("student_absence"), meetings: c("meeting"),
    onboarding: c("staff_onboarding"), dedicatedRoles: c("staff_dedicated_role"),
    groups: c("student_group"),
  };
  db.close();
  return NextResponse.json({ success: true, ...result });
}
