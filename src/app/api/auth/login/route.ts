import { NextRequest, NextResponse } from "next/server";

const AUTH_USER = process.env.AUTH_USER || "admin";
const AUTH_PASS = process.env.AUTH_PASS || "changeme";
const COOKIE_NAME = "schedule_auth";
const VALID_TOKEN = Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString("base64");

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password } = body;

  if (username === AUTH_USER && password === AUTH_PASS) {
    const res = NextResponse.json({ success: true });
    res.cookies.set(COOKIE_NAME, VALID_TOKEN, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
