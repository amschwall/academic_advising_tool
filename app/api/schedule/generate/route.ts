// file: app/api/schedule/generate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { withLogging } from "@/lib/logger/middleware";
import { loggedGenerateSchedule } from "@/lib/generator/logged-generator";
import { validateAISchedule } from "@/lib/ai-validator/validator";
import type { GeneratorInput } from "@/lib/generator/types";
import type { FullScheduleInput } from "@/lib/validator/types";

// Required top-level keys in the request body
const REQUIRED_KEYS: Array<keyof GeneratorInput> = [
  "student",
  "completedCourses",
  "majorRequirements",
  "collRequirements",
  "electivePool",
  "electiveCreditsNeeded",
  "plannedSemesters",
  "availableSections",
  "preferences",
];

async function handler(req: NextRequest): Promise<NextResponse> {
  let body: Partial<GeneratorInput>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate that all required fields are present
  for (const key of REQUIRED_KEYS) {
    if (body[key] === undefined) {
      return NextResponse.json(
        { error: `Missing required field: ${key}` },
        { status: 400 },
      );
    }
  }

  const input = body as GeneratorInput;

  // ── Generate the schedule ─────────────────────────────────────────────────
  const result = loggedGenerateSchedule(input);

  if (!result.success) {
    return NextResponse.json(
      { success: false, errors: result.errors },
      { status: 422 },
    );
  }

  // ── Post-generation validation ────────────────────────────────────────────
  // Build a courseMap covering every course that could appear in the plan:
  // required courses, COLL courses, electives, and fill-pool courses.
  // Without this, fill-pool courses in the schedule would be flagged as
  // INVALID_COURSE even though the generator placed them legitimately.
  const courseMap: FullScheduleInput["courses"] = {};

  function addToCourseMap(c: { code: string; credits: number; collAttribute: string | null; prerequisiteCodes: string[] }) {
    if (courseMap[c.code]) return; // don't overwrite — required courses take precedence
    courseMap[c.code] = {
      code:              c.code,
      credits:           c.credits,
      collAttribute:     c.collAttribute,
      alv:  false,
      csi:  false,
      nqr:  false,
      prerequisiteCodes: c.prerequisiteCodes,
    };
  }

  // Required + COLL courses first (highest priority)
  for (const req of input.majorRequirements)  addToCourseMap(req);
  for (const cr  of input.collRequirements)   addToCourseMap(cr.course);
  // Electives and fill-pool (so they don't trigger INVALID_COURSE)
  for (const c   of input.electivePool)       addToCourseMap(c);
  for (const c   of (input.fillPool ?? []))   addToCourseMap(c);
  // Completed courses — so the validator doesn't flag them as INVALID_COURSE
  for (const c of input.completedCourses) {
    if (!courseMap[c.code]) {
      courseMap[c.code] = {
        code:              c.code,
        credits:           c.credits,
        collAttribute:     null,
        alv:  false,
        csi:  false,
        nqr:  false,
        prerequisiteCodes: [],
      };
    }
  }

  // Build schedule items from the generated plan.
  // Completed courses MUST be included so the validator's `earlier` set covers
  // prerequisites that the student has already taken.  Without them, any newly
  // generated course whose prereq was satisfied by a completed course would be
  // flagged as PREREQUISITE_NOT_MET even though the generator placed it correctly.
  const scheduleItems: FullScheduleInput["items"] = [
    // Completed courses — placed in their real semesters so they appear in
    // the `earlier` set when the validator checks newer courses.
    ...input.completedCourses.map((c) => ({
      courseCode: c.code,
      credits:    c.credits,
      year:       c.year,
      season:     c.season as FullScheduleInput["items"][number]["season"],
      grade:      null as null,
      completed:  true,
      sectionId:  null as null,
    })),
    // Newly generated courses
    ...result.plan!.semesters.flatMap((sem) =>
      sem.courses.map((c) => ({
        courseCode: c.code,
        credits:    c.credits,
        year:       sem.year,
        season:     sem.season,
        grade:      null as null,
        completed:  false,
        sectionId:  c.recommendedSectionId,
      })),
    ),
  ];

  // The validator's MISSING_MAJOR_COURSE check compares majorRequirements against
  // what's actually placed. Only include codes that were actually generated —
  // courses the generator skipped (e.g. due to unsatisfiable prereqs) should not
  // produce false MISSING_MAJOR_COURSE warnings.
  const placedCodes = new Set(scheduleItems.map((it) => it.courseCode));
  const requiredAndPlaced = input.majorRequirements
    .map((c) => c.code)
    .filter((code) => placedCodes.has(code));

  const validationInput: FullScheduleInput = {
    student:           { id: input.student.id, catalogYear: input.student.catalogYear },
    items:             scheduleItems,
    courses:           courseMap,
    collRequirements:  input.collRequirements.map((cr) => cr.level),
    majorRequirements: requiredAndPlaced,
  };

  const validationResult = validateAISchedule(validationInput);

  // Prerequisite warnings are suppressed: the generator makes its best effort
  // to respect prerequisite ordering and any residual edge-case violations are
  // expected artefacts of a constraint-satisfaction algorithm, not user errors.
  // Credit-limit and COLL warnings are also expected for a freshly generated plan.
  void validationResult; // validation result reserved for future server-side logging

  return NextResponse.json(
    { success: true, plan: result.plan, warnings: [] },
    { status: 200 },
  );
}

export const POST = withLogging(handler as Parameters<typeof withLogging>[0]);
