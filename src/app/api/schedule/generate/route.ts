import { NextRequest, NextResponse } from "next/server";
import { generateWeekFromTemplates } from "@/lib/scheduling/generator";


export async function POST(req: NextRequest) {
  const body = await req.json();
  const { weekStart } = body;

  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || isNaN(new Date(weekStart + "T00:00:00").getTime())) {
    return NextResponse.json({ error: "Valid weekStart date required (YYYY-MM-DD)" }, { status: 400 });
  }

  const result = generateWeekFromTemplates(weekStart);
  return NextResponse.json(result);
}
