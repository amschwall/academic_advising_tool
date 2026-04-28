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

  // ── Generate the schedule (logs timing + failures internally) ─────────────
  const result = loggedGenerateSchedule(input);

  if (!result.success) {
    return NextResponse.json(
      { success: false, errors: result.errors },
      { status: 422 },
    );
  }

  // ── Validate the generated plan via the AI validator ─────────────────────
  // Build a FullScheduleInput from the generated plan so validateAISchedule
  // can check course existence and constraint compliance.
  const courseMap: FullScheduleInput["courses"] = {};
  for (const req of input.majorRequirements) {
    courseMap[req.code] = {
      code:              req.code,
      credits:           req.credits,
      collAttribute:     req.collAttribute,
      alv:  false,
      csi:  false,
      nqr:  false,
      prerequisiteCodes: req.prerequisiteCodes,
    };
  }
  for (const cr of input.collRequirements) {
    courseMap[cr.course.code] = {
      code:              cr.course.code,
      credits:           cr.course.credits,
      collAttribute:     cr.course.collAttribute,
      alv:  false,
      csi:  false,
      nqr:  false,
      prerequisiteCodes: cr.course.prerequisiteCodes,
    };
  }

  const scheduleItems: FullScheduleInput["items"] = result.plan!.semesters.flatMap(
    (sem) =>
      sem.courses.map((c) => ({
        courseCode: c.code,
        credits:    c.credits,
        year:       sem.year,
        season:     sem.season,
        grade:      null,
        completed:  false,
        sectionId:  c.recommendedSectionId,
      })),
  );

  const validationInput: FullScheduleInput = {
    student:           { id: input.student.id, catalogYear: input.student.catalogYear },
    items:             scheduleItems,
    courses:           courseMap,
    collRequirements:  input.collRequirements.map((cr) => cr.level),
    majorRequirements: input.majorRequirements.map((c) => c.code),
  };

  validateAISchedule(validationInput); // logs errors internally; we surface the plan regardless

  return NextResponse.json({ success: true, plan: result.plan }, { status: 200 });
}

export const POST = withLogging(handler as Parameters<typeof withLogging>[0]);
