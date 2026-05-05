// file: app/api/auth/login/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const token =
    body !== null &&
    typeof body === "object" &&
    "token" in body &&
    typeof (body as Record<string, unknown>).token === "string"
      ? (body as { token: string }).token
      : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing required field: token" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  // Server-side: enforce @wm.edu restriction as the security boundary
  if (!data.user.email?.toLowerCase().endsWith("@wm.edu")) {
    return NextResponse.json(
      { error: "Only @wm.edu accounts are permitted" },
      { status: 403 }
    );
  }

  const user = {
    id: data.user.id,
    email: data.user.email,
    ...data.user.user_metadata,
  };

  const response = NextResponse.json({ user }, { status: 200 });

  response.cookies.set("session", token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 86400,
  });

  return response;
}
