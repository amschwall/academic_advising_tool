// file: app/api/admin/users/route.ts

import { NextRequest, NextResponse } from "next/server";
import { withRole, AuthUser } from "@/lib/middleware/withRole";

async function handler(
  _req: NextRequest,
  _context: any,
  _user: AuthUser
): Promise<NextResponse> {
  // Returns mock user list until Phase 4 (data layer) is implemented
  return NextResponse.json(
    {
      users: [
        { id: "student-123", email: "student@wm.edu", role: "student" },
        { id: "advisor-456", email: "advisor@wm.edu", role: "advisor" },
        { id: "admin-789", email: "admin@wm.edu", role: "admin" },
      ],
    },
    { status: 200 }
  );
}

export const GET = withRole(["admin"])(handler);
