import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-utils";
import { toDateString } from "@/lib/utils";
import PDFDocument from "pdfkit";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime12(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

interface ShiftRow {
  date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  activity_type: string;
  status: string;
  student_name: string;
  staff_name: string | null;
  needs_swim_support: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: "weekStart and weekEnd required" }, { status: 400 });
  }

  const db = getDb(true);
  const shifts = db.prepare(`
    SELECT s.date, s.start_time, s.end_time, s.shift_type, s.activity_type,
           s.status, st.name as student_name, stf.name as staff_name,
           s.needs_swim_support
    FROM shift s
    JOIN student st ON s.student_id = st.id
    LEFT JOIN staff stf ON s.assigned_staff_id = stf.id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.date, s.start_time, st.name
  `).all(weekStart, weekEnd) as ShiftRow[];
  db.close();

  // Group shifts by date
  const dates: string[] = [];
  const d = new Date(weekStart + "T00:00:00");
  const end = new Date(weekEnd + "T00:00:00");
  while (d <= end) {
    dates.push(toDateString(d));
    d.setDate(d.getDate() + 1);
  }

  const shiftsByDate = new Map<string, ShiftRow[]>();
  for (const date of dates) shiftsByDate.set(date, []);
  for (const s of shifts) {
    const list = shiftsByDate.get(s.date);
    if (list) list.push(s);
  }

  // Build PDF
  const doc = new PDFDocument({
    size: "LETTER",
    layout: "landscape",
    margins: { top: 36, bottom: 36, left: 36, right: 36 },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pdfReady = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const pageW = 792 - 72; // letter landscape minus margins
  const pageH = 612 - 72;

  // Title
  doc.fontSize(16).font("Helvetica-Bold")
    .text(`Weekly Schedule: ${weekStart} to ${weekEnd}`, { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(8).font("Helvetica").fillColor("#666666")
    .text(`Generated ${new Date().toLocaleDateString()}`, { align: "center" });
  doc.fillColor("#000000");
  doc.moveDown(0.8);

  // Table layout
  const cols = dates.length;
  const colW = pageW / cols;
  const tableTop = doc.y;
  const headerH = 32;

  // Column headers (day names + dates)
  for (let i = 0; i < cols; i++) {
    const x = 36 + i * colW;
    const date = dates[i];
    const dayName = DAY_NAMES[new Date(date + "T00:00:00").getDay()];

    doc.save();
    doc.rect(x, tableTop, colW, headerH).fill("#374151");
    doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold")
      .text(dayName, x + 4, tableTop + 4, { width: colW - 8 });
    doc.fillColor("#d1d5db").fontSize(7).font("Helvetica")
      .text(date, x + 4, tableTop + 17, { width: colW - 8 });
    doc.restore();
  }

  // Draw shifts in each column
  const bodyTop = tableTop + headerH + 2;
  let maxColBottom = bodyTop;

  for (let i = 0; i < cols; i++) {
    const x = 36 + i * colW;
    const date = dates[i];
    const dayShifts = shiftsByDate.get(date) || [];
    let y = bodyTop;

    if (dayShifts.length === 0) {
      doc.fillColor("#9ca3af").fontSize(7).font("Helvetica")
        .text("No shifts", x + 4, y + 4, { width: colW - 8 });
      y += 20;
    }

    for (const s of dayShifts) {
      const isOpen = !s.staff_name || s.status === "open" || s.status === "called_out";
      const cardH = 36;

      // Check page overflow — start a new page if needed
      if (y + cardH > 36 + pageH) break;

      // Card background
      doc.save();
      if (isOpen) {
        doc.rect(x + 2, y, colW - 4, cardH).fill("#fef2f2");
        doc.rect(x + 2, y, 3, cardH).fill("#ef4444");
      } else {
        doc.rect(x + 2, y, colW - 4, cardH).fill("#f9fafb");
        doc.rect(x + 2, y, 3, cardH).fill("#3b82f6");
      }
      doc.restore();

      // Student name
      doc.fillColor("#111827").fontSize(8).font("Helvetica-Bold")
        .text(s.student_name, x + 8, y + 3, { width: colW - 16, lineBreak: false });

      // Time
      doc.fillColor("#6b7280").fontSize(7).font("Helvetica")
        .text(`${formatTime12(s.start_time)} - ${formatTime12(s.end_time)}`, x + 8, y + 13, { width: colW - 16, lineBreak: false });

      // Staff or UNCOVERED
      if (isOpen) {
        doc.fillColor("#dc2626").fontSize(7).font("Helvetica-Bold")
          .text("UNCOVERED", x + 8, y + 23, { width: colW - 16, lineBreak: false });
      } else {
        doc.fillColor("#374151").fontSize(7).font("Helvetica")
          .text(s.staff_name!, x + 8, y + 23, { width: colW - 16, lineBreak: false });
      }

      // Tags on the right side
      const tags: string[] = [];
      if (s.shift_type === "overnight") tags.push("ON");
      if (s.needs_swim_support) tags.push("SWIM");
      if (tags.length > 0) {
        doc.fillColor("#6366f1").fontSize(6).font("Helvetica-Bold")
          .text(tags.join(" "), x + colW - 40, y + 3, { width: 36, align: "right", lineBreak: false });
      }

      y += cardH + 2;
    }

    if (y > maxColBottom) maxColBottom = y;
  }

  // Draw column borders
  for (let i = 0; i <= cols; i++) {
    const x = 36 + i * colW;
    doc.save()
      .moveTo(x, tableTop).lineTo(x, maxColBottom)
      .strokeColor("#e5e7eb").lineWidth(0.5).stroke()
      .restore();
  }

  // Horizontal borders
  doc.save()
    .moveTo(36, tableTop).lineTo(36 + pageW, tableTop)
    .strokeColor("#e5e7eb").lineWidth(0.5).stroke()
    .restore();
  doc.save()
    .moveTo(36, tableTop + headerH).lineTo(36 + pageW, tableTop + headerH)
    .strokeColor("#e5e7eb").lineWidth(0.5).stroke()
    .restore();

  // Summary footer
  const totalShifts = shifts.length;
  const uncovered = shifts.filter(s => !s.staff_name || s.status === "open" || s.status === "called_out").length;
  const overnights = shifts.filter(s => s.shift_type === "overnight").length;
  const swimShifts = shifts.filter(s => s.needs_swim_support).length;

  doc.y = maxColBottom + 12;
  doc.fillColor("#374151").fontSize(8).font("Helvetica")
    .text(
      `Total shifts: ${totalShifts}  |  Uncovered: ${uncovered}  |  Overnight: ${overnights}  |  Swim: ${swimShifts}`,
      { align: "center" },
    );

  doc.end();
  const pdfBuffer = await pdfReady;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="schedule_${weekStart}_${weekEnd}.pdf"`,
    },
  });
}
