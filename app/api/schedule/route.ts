// file: app/api/schedule/route.ts

import { NextRequest, NextResponse } from "next/server";
import { withRole, AuthUser } from "@/lib/middleware/withRole";
import { prisma } from "@/lib/db";
import { Season } from "@prisma/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findOrCreateSchedule(studentId: string) {
  let schedule = await prisma.schedule.findFirst({ where: { studentId } });
  if (!schedule) {
    schedule = await prisma.schedule.create({
      data: { studentId, name: "Four-Year Plan", updatedAt: new Date() },
    });
  }
  return schedule;
}

async function findStudent(email: string, id: string) {
  return (
    (await prisma.student.findUnique({ where: { email } })) ??
    (await prisma.student.findUnique({ where: { id } }))
  );
}

// ── GET — load the student's schedule ────────────────────────────────────────

async function getHandler(
  _req: NextRequest,
  _context: unknown,
  user: AuthUser
): Promise<NextResponse> {
  const student = await findStudent(user.email ?? "", user.id);
  if (!student) return NextResponse.json({ items: [] });

  const schedule = await prisma.schedule.findFirst({
    where: { studentId: student.id },
    include: {
      items: {
        include: {
          course: {
            include: {
              prerequisites: {
                include: { prerequisite: { select: { code: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!schedule) return NextResponse.json({ items: [] });

  const items = schedule.items.map((item) => ({
    year:      item.year,
    season:    item.season,
    completed: item.completed,
    grade:     item.grade,
    course: {
      code:              item.course.code,
      title:             item.course.title,
      credits:           item.course.credits,
      department:        item.course.department,
      collAttribute:     item.course.collAttribute,
      alv:               item.course.alv,
      csi:               item.course.csi,
      nqr:               item.course.nqr,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      majorRestriction:  (item.course as any).majorRestriction ?? null,
      prerequisiteCodes: item.course.prerequisites.map((p) => p.prerequisite.code),
      sections:          [],
    },
  }));

  return NextResponse.json({ items });
}

// ── POST — apply pending add/remove changes ───────────────────────────────────

async function postHandler(
  req: NextRequest,
  _context: unknown,
  user: AuthUser
): Promise<NextResponse> {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { changes } = body as {
    changes: Array<{
      type:       "add" | "remove";
      courseCode: string;
      year:       number;
      season:     string;
    }>;
  };

  if (!Array.isArray(changes)) {
    return NextResponse.json({ error: "changes must be an array" }, { status: 400 });
  }

  const student = await findStudent(user.email ?? "", user.id);
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const schedule = await findOrCreateSchedule(student.id);

  for (const change of changes) {
    const course = await prisma.course.findUnique({ where: { code: change.courseCode } });
    if (!course) continue;

    const season = change.season as Season;

    if (change.type === "add") {
      await prisma.scheduleItem.upsert({
        where: { scheduleId_courseId: { scheduleId: schedule.id, courseId: course.id } },
        update: { year: change.year, season },
        create: { scheduleId: schedule.id, courseId: course.id, year: change.year, season, completed: false },
      });
    } else {
      await prisma.scheduleItem.deleteMany({
        where: { scheduleId: schedule.id, courseId: course.id },
      });
    }
  }

  await prisma.schedule.update({ where: { id: schedule.id }, data: { updatedAt: new Date() } });

  return NextResponse.json({ success: true });
}

export const GET  = withRole(["student", "advisor", "admin"])(getHandler as Parameters<ReturnType<typeof withRole>>[0]);
export const POST = withRole(["student", "advisor", "admin"])(postHandler as Parameters<ReturnType<typeof withRole>>[0]);
