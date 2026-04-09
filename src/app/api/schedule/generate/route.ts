import { NextRequest, NextResponse } from "next/server";
import { generateWeekFromTemplates } from "@/lib/scheduling/generator";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { weekStart } = body;

  if (!weekStart) {
    return NextResponse.json({ error: "weekStart required" }, { status: 400 });
  }

  const result = generateWeekFromTemplates(weekStart);
  return NextResponse.json(result);
}
