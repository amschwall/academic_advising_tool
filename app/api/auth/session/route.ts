// file: app/api/auth/session/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionToken = req.cookies.get("session")?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const { data, error } = await supabase.auth.getUser(sessionToken);

  if (error || !data.user) {
    return NextResponse.json(
      { error: "Invalid or expired session" },
      { status: 401 }
    );
  }

  const user = {
    id: data.user.id,
    email: data.user.email,
    ...data.user.user_metadata,
  };

  return NextResponse.json({ user }, { status: 200 });
}
