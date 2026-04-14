import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import PDFDocument from "pdfkit";

interface StaffShift {
  staff_id: number; staff_name: string; date: string;
  start_time: string; end_time: string; shift_type: string;
  student_id: number; student_name: string;
}

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (hours <= 0) hours += 24;
  return hours;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: "weekStart and weekEnd required" }, { status: 400 });
  }

  const db = getDb(true);

  const primaryShifts = db.prepare(`
    SELECT s.assigned_staff_id as staff_id, stf.name as staff_name,
           s.date, s.start_time, s.end_time, s.shift_type,
           s.student_id, st.name as student_name
    FROM shift s
    JOIN staff stf ON s.assigned_staff_id = stf.id
    JOIN student st ON s.student_id = st.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
    AND s.assigned_staff_id IS NOT NULL
    ORDER BY stf.name, s.date
  `).all(weekStart, weekEnd) as StaffShift[];

  const secondShifts = db.prepare(`
    SELECT s.second_staff_id as staff_id, stf.name as staff_name,
           s.date, s.start_time, s.end_time, s.shift_type,
           s.student_id, st.name as student_name
    FROM shift s
    JOIN staff stf ON s.second_staff_id = stf.id
    JOIN student st ON s.student_id = st.id
    WHERE s.date >= ? AND s.date <= ?
    AND s.status IN ('scheduled', 'covered')
    AND s.second_staff_id IS NOT NULL
    ORDER BY stf.name, s.date
  `).all(weekStart, weekEnd) as StaffShift[];

  db.close();

  const combined = [...primaryShifts, ...secondShifts];

  // Group by staff
  const staffMap = new Map<number, { name: string; shifts: StaffShift[] }>();
  for (const s of combined) {
    if (!staffMap.has(s.staff_id)) staffMap.set(s.staff_id, { name: s.staff_name, shifts: [] });
    staffMap.get(s.staff_id)!.shifts.push(s);
  }

  // Compute burnout metrics
  const burnoutData = Array.from(staffMap.entries()).map(([, data]) => {
    const shifts = data.shifts;
    const uniqueDates = [...new Set(shifts.map(s => s.date))].sort();
    const totalHours = shifts.reduce((acc, s) => acc + calcHours(s.start_time, s.end_time), 0);

    let maxConsecutive = 1, currentStreak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prev = new Date(uniqueDates[i - 1] + "T00:00:00");
      const curr = new Date(uniqueDates[i] + "T00:00:00");
      if ((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24) === 1) {
        currentStreak++;
        if (currentStreak > maxConsecutive) maxConsecutive = currentStreak;
      } else {
        currentStreak = 1;
      }
    }

    const studentCounts = new Map<string, number>();
    for (const s of shifts) {
      studentCounts.set(s.student_name, (studentCounts.get(s.student_name) || 0) + 1);
    }
    const topStudent = [...studentCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const overnightCount = shifts.filter(s => s.shift_type === "overnight").length;

    let riskScore = 0;
    if (totalHours > 50) riskScore += 3; else if (totalHours > 42) riskScore += 1;
    if (maxConsecutive >= 7) riskScore += 3; else if (maxConsecutive >= 6) riskScore += 2; else if (maxConsecutive >= 5) riskScore += 1;
    if ((topStudent?.[1] || 0) >= 4) riskScore += 2; else if ((topStudent?.[1] || 0) >= 3) riskScore += 1;
    if (overnightCount >= 3) riskScore += 2; else if (overnightCount >= 2) riskScore += 1;
    if (shifts.length > 10) riskScore += 2; else if (shifts.length > 7) riskScore += 1;

    return {
      name: data.name,
      totalShifts: shifts.length,
      totalHours: Math.round(totalHours * 10) / 10,
      daysWorked: uniqueDates.length,
      maxConsecutive,
      overnightCount,
      topStudent: topStudent ? `${topStudent[0]} (${topStudent[1]}x)` : "—",
      riskScore,
      riskLevel: riskScore >= 6 ? "HIGH" : riskScore >= 3 ? "MODERATE" : "LOW",
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  // Generate PDF
  const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margins: { top: 36, bottom: 36, left: 36, right: 36 } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const pdfReady = new Promise<Buffer>(resolve => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const pageW = 792 - 72;

  // Title
  doc.fontSize(18).font("Helvetica-Bold").fillColor("#111827")
    .text("Staff Burnout Risk Report", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor("#6b7280")
    .text(`Week: ${weekStart} to ${weekEnd}  |  Generated: ${new Date().toLocaleDateString()}`, { align: "center" });
  doc.moveDown(1);

  // Summary box
  const highCount = burnoutData.filter(b => b.riskLevel === "HIGH").length;
  const modCount = burnoutData.filter(b => b.riskLevel === "MODERATE").length;
  const lowCount = burnoutData.filter(b => b.riskLevel === "LOW").length;

  const summaryY = doc.y;
  doc.save();
  doc.roundedRect(36, summaryY, pageW, 40, 6).fill("#f0f9ff");
  doc.restore();
  doc.fillColor("#1e40af").fontSize(10).font("Helvetica-Bold")
    .text(`Summary:  `, 52, summaryY + 13, { continued: true });
  doc.fillColor("#dc2626").text(`${highCount} High Risk`, { continued: true });
  doc.fillColor("#6b7280").font("Helvetica").text(`  |  `, { continued: true });
  doc.fillColor("#d97706").font("Helvetica-Bold").text(`${modCount} Moderate`, { continued: true });
  doc.fillColor("#6b7280").font("Helvetica").text(`  |  `, { continued: true });
  doc.fillColor("#16a34a").font("Helvetica-Bold").text(`${lowCount} Low`);
  doc.y = summaryY + 52;

  // Table header
  const cols = [
    { label: "Staff Member", width: 130, align: "left" as const },
    { label: "Shifts", width: 50, align: "right" as const },
    { label: "Hours", width: 55, align: "right" as const },
    { label: "Days", width: 45, align: "right" as const },
    { label: "Consec. Days", width: 75, align: "right" as const },
    { label: "Overnights", width: 65, align: "right" as const },
    { label: "Top Student", width: 160, align: "left" as const },
    { label: "Risk Score", width: 65, align: "right" as const },
    { label: "Risk Level", width: 75, align: "center" as const },
  ];

  const tableX = 36;
  const headerH = 24;
  let y = doc.y;

  // Header row
  doc.save();
  doc.rect(tableX, y, pageW, headerH).fill("#1f2937");
  let xPos = tableX;
  for (const col of cols) {
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold")
      .text(col.label, xPos + 6, y + 7, { width: col.width - 12, align: col.align });
    xPos += col.width;
  }
  doc.restore();
  y += headerH;

  // Data rows
  for (const b of burnoutData) {
    const rowH = 22;
    if (y + rowH > 612 - 36) {
      doc.addPage();
      y = 36;
    }

    // Row background
    doc.save();
    if (b.riskLevel === "HIGH") {
      doc.rect(tableX, y, pageW, rowH).fill("#fef2f2");
    } else if (b.riskLevel === "MODERATE") {
      doc.rect(tableX, y, pageW, rowH).fill("#fffbeb");
    } else {
      doc.rect(tableX, y, pageW, rowH).fill(burnoutData.indexOf(b) % 2 === 0 ? "#ffffff" : "#f9fafb");
    }
    doc.restore();

    xPos = tableX;
    const values = [
      b.name,
      String(b.totalShifts),
      `${b.totalHours}h`,
      String(b.daysWorked),
      String(b.maxConsecutive),
      String(b.overnightCount),
      b.topStudent,
      String(b.riskScore),
      b.riskLevel,
    ];

    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const val = values[ci];
      const isRiskCol = ci === cols.length - 1;

      if (isRiskCol) {
        // Color-coded risk badge
        const badgeColor = b.riskLevel === "HIGH" ? "#dc2626" : b.riskLevel === "MODERATE" ? "#d97706" : "#16a34a";
        const badgeW = 50;
        const badgeX = xPos + (col.width - badgeW) / 2;
        doc.save();
        doc.roundedRect(badgeX, y + 4, badgeW, 14, 3).fill(badgeColor);
        doc.fillColor("#ffffff").fontSize(7).font("Helvetica-Bold")
          .text(val, badgeX, y + 7, { width: badgeW, align: "center" });
        doc.restore();
      } else {
        const fontWeight = ci === 0 ? "Helvetica-Bold" : "Helvetica";
        const color = ci === cols.length - 2 ? (b.riskScore >= 6 ? "#dc2626" : b.riskScore >= 3 ? "#d97706" : "#374151") : "#374151";
        doc.fillColor(color).fontSize(8).font(fontWeight)
          .text(val, xPos + 6, y + 6, { width: col.width - 12, align: col.align, lineBreak: false });
      }
      xPos += col.width;
    }

    // Row border
    doc.save().moveTo(tableX, y + rowH).lineTo(tableX + pageW, y + rowH)
      .strokeColor("#e5e7eb").lineWidth(0.5).stroke().restore();

    y += rowH;
  }

  // Risk factors legend
  doc.y = y + 16;
  doc.fillColor("#9ca3af").fontSize(7).font("Helvetica")
    .text("Risk factors: Weekly hours (>42h/50h), consecutive days (5/6/7+ — 5 days is normal), same-student repetition (3x/4x+), overnight frequency (2/3+), total shifts (>7/10)", 36, doc.y, { width: pageW });

  doc.end();
  const pdfBuffer = await pdfReady;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="burnout-report_${weekStart}_${weekEnd}.pdf"`,
    },
  });
}
