// file: app/api/health/route.ts

import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
