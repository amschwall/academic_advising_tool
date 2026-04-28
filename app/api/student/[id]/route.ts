// file: app/api/student/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { withRole, AuthUser } from "@/lib/middleware/withRole";

async function handler(
  _req: NextRequest,
  context: { params: { id: string } },
  user: AuthUser
): Promise<NextResponse> {
  const { id } = context.params;
  const role = user.user_metadata?.role;

  if (role === "student" && user.id !== id) {
    return NextResponse.json(
      { error: "Forbidden: students may only access their own data" },
      { status: 403 }
    );
  }

  if (role === "advisor") {
    const assigned = user.user_metadata?.assignedStudents ?? [];
    if (!assigned.includes(id)) {
      return NextResponse.json(
        { error: "Forbidden: student is not assigned to this advisor" },
        { status: 403 }
      );
    }
  }

  // admin, or student/advisor with verified access
  // Returns mock data until Phase 4 (data layer) is implemented
  return NextResponse.json(
    { student: { id, email: `${id}@wm.edu` } },
    { status: 200 }
  );
}

export const GET = withRole(["student", "advisor", "admin"])(handler);
