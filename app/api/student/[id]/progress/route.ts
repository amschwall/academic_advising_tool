// file: app/api/student/[id]/progress/route.ts

import { NextRequest, NextResponse } from "next/server";
import { withRole, AuthUser } from "@/lib/middleware/withRole";
import { prisma } from "@/lib/db";
import { validateGraduationProgress } from "@/lib/validator/validator";
import type { GraduationRequirement } from "@/lib/validator/types";

async function handler(
  _req: NextRequest,
  context: { params: { id: string } },
  user: AuthUser
): Promise<NextResponse> {
  const { id } = context.params;
  const role = user.user_metadata?.role;

  // Ownership check — mirrors app/api/student/[id]/route.ts
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

  // Load student schedule items and requirements from the database
  const [items, requirements, courses] = await Promise.all([
    prisma.scheduleItem.findMany({ where: { studentId: id } }),
    prisma.requirement.findMany({ where: { studentId: id } }),
    // Load all courses referenced by the student's items
    prisma.course.findMany({ where: {} }),
  ]);

  // Build courses lookup keyed by code
  const coursesMap = Object.fromEntries(
    (courses as Array<{ code: string; credits: number; collAttribute: string | null; alv: boolean; csi: boolean; nqr: boolean; prerequisiteCodes: string[] }>)
      .map((c) => [c.code, c])
  );

  const progress = validateGraduationProgress({
    student: { catalogYear: 2024 },
    items: items as any,
    requirements: requirements as GraduationRequirement[],
    courses: coursesMap,
  });

  return NextResponse.json(progress, { status: 200 });
}

export const GET = withRole(["student", "advisor", "admin"])(handler);
