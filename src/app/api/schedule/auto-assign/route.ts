import { NextRequest, NextResponse } from "next/server";
import { autoAssignOpenShifts } from "@/lib/scheduling/generator";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { weekStart, weekEnd } = body;

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: "weekStart and weekEnd required" }, { status: 400 });
  }

  const result = autoAssignOpenShifts(weekStart, weekEnd);
  return NextResponse.json(result);
}
