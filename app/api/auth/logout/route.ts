// file: app/api/auth/logout/route.ts

import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const response = NextResponse.json(
    { message: "Logged out successfully" },
    { status: 200 }
  );

  // Clear the session cookie by setting Max-Age to 0
  response.cookies.set("session", "", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
