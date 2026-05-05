// file: app/api/courses/search/route.ts

import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/middleware/withRole";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { searchCache } from "@/lib/cache/searchCache";
import { CacheKeys, SEARCH_TTL_SECONDS } from "@/lib/cache/keys";

const DEFAULT_PAGE  = 1;
const DEFAULT_LIMIT = 20;

interface SearchPayload {
  courses: unknown[];
  total:   number;
  page:    number;
  limit:   number;
}

async function handler(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  // ── Cache check ───────────────────────────────────────────────────────────
  const cacheKey = CacheKeys.searchResult(searchParams);
  const cached   = await searchCache.get<SearchPayload>(cacheKey);
  if (cached) return NextResponse.json(cached, { status: 200 });

  const department    = searchParams.get("department");
  const code          = searchParams.get("code");
  const title         = searchParams.get("title");
  const collAttribute = searchParams.get("collAttribute");
  const creditsParam  = searchParams.get("credits");
  const days          = searchParams.get("days");
  const alvParam      = searchParams.get("alv");
  const csiParam      = searchParams.get("csi");
  const nqrParam      = searchParams.get("nqr");

  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? String(DEFAULT_PAGE),  10) || DEFAULT_PAGE);
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT);
  const skip  = (page - 1) * limit;

  // Build Prisma where clause from filter params
  const where: Record<string, unknown> = {};
  if (department)    where["department"]    = { contains: department,    mode: "insensitive" };
  if (code)          where["code"]          = { contains: code,          mode: "insensitive" };
  if (title)         where["title"]         = { contains: title,         mode: "insensitive" };
  if (collAttribute) where["collAttribute"] = { equals: collAttribute };
  if (alvParam === "true") where["alv"] = true;
  if (csiParam === "true") where["csi"] = true;
  if (nqrParam === "true") where["nqr"] = true;
  if (creditsParam) {
    const credits = parseInt(creditsParam, 10);
    if (!isNaN(credits)) where["credits"] = { equals: credits };
  }

  // Always include prerequisites and sections so the component has the data it needs.
  // When a days filter is present, restrict sections to those that match.
  const sectionsInclude = days
    ? { where: { days: { contains: days } } }
    : true;

  type RawCourse = Prisma.CourseGetPayload<{
    include: {
      prerequisites: { include: { prerequisite: { select: { code: true } } } };
      sections: true;
    };
  }>;

  let rawCourses: RawCourse[];
  let total: number;

  try {
    [rawCourses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: limit,
        include: {
          prerequisites: {
            include: {
              prerequisite: { select: { code: true } },
            },
          },
          sections: sectionsInclude,
        },
      }),
      prisma.course.count({ where }),
    ]);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  // Remap to the shape the component expects:
  //   prerequisiteCodes: string[]           (flattened from the join table)
  //   sections[].professor / .location      (Section stores instructor, not professor)
  const courses = rawCourses.map((c) => ({
    code:             c.code,
    title:            c.title,
    department:       c.department,
    credits:          c.credits,
    collAttribute:    c.collAttribute,
    alv:              c.alv,
    csi:              c.csi,
    nqr:              c.nqr,
    description:      c.description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    majorRestriction: (c as any).majorRestriction ?? null,
    prerequisiteCodes: c.prerequisites.map((p) => p.prerequisite.code),
    sections: c.sections.map((s) => ({
      professor: s.instructor ?? "TBA",
      location:  s.location  ?? "TBA",
      days:      s.days      ?? "",
      startTime: s.startTime ?? null,
      endTime:   s.endTime   ?? null,
    })),
  }));

  const payload: SearchPayload = { courses, total, page, limit };
  await searchCache.set(cacheKey, payload, SEARCH_TTL_SECONDS);
  return NextResponse.json(payload, { status: 200 });
}

export const GET = withRole(["student", "advisor", "admin"])(
  handler as Parameters<ReturnType<typeof withRole>>[0]
);
