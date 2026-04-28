// file: lib/validator/validator.ts

import type {
  Season,
  Semester,
  ValidatorScheduleItem,
  SectionTimeInfo,
  ValidationError,
  ValidationResult,
  CourseAdditionInput,
  FullScheduleInput,
  GraduationProgressInput,
  GraduationProgress,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SEMESTER_CREDITS = 18;
const MIN_SEMESTER_CREDITS = 12;
const GRADUATION_CREDITS   = 120;

const SEASON_ORDER: Record<Season, number> = {
  SPRING: 0,
  SUMMER: 1,
  FALL:   2,
  WINTER: 3,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns true when semester A comes strictly before semester B in time. */
function isBefore(
  a: { year: number; season: Season },
  b: { year: number; season: Season }
): boolean {
  if (a.year !== b.year) return a.year < b.year;
  return SEASON_ORDER[a.season] < SEASON_ORDER[b.season];
}

/**
 * Parses a 12-hour time string ("10:00am", "1:20pm") into minutes since
 * midnight for numeric comparison.
 */
function parseTimeToMinutes(timeStr: string): number {
  const isPm = timeStr.endsWith("pm");
  const clean = timeStr.slice(0, -2);
  const colonIdx = clean.indexOf(":");
  let hour = parseInt(clean.slice(0, colonIdx), 10);
  const min  = parseInt(clean.slice(colonIdx + 1), 10);

  if (isPm && hour !== 12) hour += 12;   // 1pm → 13, but 12pm stays 12 (noon)
  if (!isPm && hour === 12) hour = 0;    // 12am → midnight (0)

  return hour * 60 + min;
}

/** Returns true when the two day strings share at least one calendar day. */
function daysOverlap(daysA: string, daysB: string): boolean {
  for (const ch of daysA) {
    if (daysB.includes(ch)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// checkCollRequirements
// ---------------------------------------------------------------------------

/**
 * Returns a MISSING_COLL error for each required COLL level not covered by a
 * completed course in `completedCourses`.
 *
 * @param completedCourses  Courses the student has completed (with collAttribute).
 * @param requiredCollLevels  e.g. ["COLL 100", "COLL 150", "COLL 400"]
 */
export function checkCollRequirements(
  completedCourses: Array<{ code: string; collAttribute: string | null }>,
  requiredCollLevels: string[]
): ValidationError[] {
  const satisfiedLevels = new Set(
    completedCourses
      .filter((c) => c.collAttribute !== null)
      .map((c) => c.collAttribute as string)
  );

  return requiredCollLevels
    .filter((level) => !satisfiedLevels.has(level))
    .map((level) => ({
      type: "MISSING_COLL" as const,
      message: `Missing ${level} requirement — no completed course satisfies this level`,
    }));
}

// ---------------------------------------------------------------------------
// checkMajorRequirements
// ---------------------------------------------------------------------------

/**
 * Returns a MISSING_MAJOR_COURSE error for each required course code not
 * present in `completedCourseCodes`.
 */
export function checkMajorRequirements(
  completedCourseCodes: Set<string>,
  requiredCourseCodes: string[]
): ValidationError[] {
  return requiredCourseCodes
    .filter((code) => !completedCourseCodes.has(code))
    .map((code) => ({
      type: "MISSING_MAJOR_COURSE" as const,
      message:    `Required major course ${code} is not in the schedule`,
      courseCode: code,
    }));
}

// ---------------------------------------------------------------------------
// checkPrerequisites
// ---------------------------------------------------------------------------

/**
 * Returns a PREREQUISITE_NOT_MET error for each prerequisite of `targetCode`
 * that is not present in `satisfiedCourseCodes`.
 *
 * The caller is responsible for deciding what "satisfied" means:
 *   - For planning: all courses in strictly earlier semesters.
 *   - For enrollment: courses completed with a passing grade.
 */
export function checkPrerequisites(
  targetCode: string,
  prerequisiteCodes: string[],
  satisfiedCourseCodes: Set<string>
): ValidationError[] {
  return prerequisiteCodes
    .filter((prereq) => !satisfiedCourseCodes.has(prereq))
    .map((prereq) => ({
      type:       "PREREQUISITE_NOT_MET" as const,
      message:    `${targetCode} requires ${prereq}, which has not been satisfied`,
      courseCode: prereq,
    }));
}

// ---------------------------------------------------------------------------
// checkSemesterCredits
// ---------------------------------------------------------------------------

/**
 * Returns credit-related errors for a semester with `totalCredits` credit
 * hours (W&M defaults: min = 12, max = 18).
 */
export function checkSemesterCredits(
  totalCredits: number,
  semester: Semester
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (totalCredits > MAX_SEMESTER_CREDITS) {
    errors.push({
      type:     "CREDIT_LIMIT_EXCEEDED" as const,
      message:  `${semester.season} ${semester.year} has ${totalCredits} credits, exceeding the maximum of ${MAX_SEMESTER_CREDITS}`,
      semester,
    });
  }

  if (totalCredits < MIN_SEMESTER_CREDITS) {
    errors.push({
      type:     "BELOW_MINIMUM_CREDITS" as const,
      message:  `${semester.season} ${semester.year} has ${totalCredits} credits, below the full-time minimum of ${MIN_SEMESTER_CREDITS}`,
      semester,
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// checkTimeConflicts
// ---------------------------------------------------------------------------

/**
 * Scans an array of sections for pairwise time conflicts within the same
 * semester.  Sections with null days or null times (TBA) are skipped.
 *
 * Two sections conflict when:
 *   1. They are in the same semester (year + season).
 *   2. Their day sets share at least one common day.
 *   3. Their time ranges overlap: startA < endB AND startB < endA.
 */
export function checkTimeConflicts(
  sections: SectionTimeInfo[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i];
      const b = sections[j];

      // Skip TBA and cross-semester pairs
      if (
        !a.days || !b.days ||
        !a.startTime || !a.endTime ||
        !b.startTime || !b.endTime
      ) {
        continue;
      }

      if (a.year !== b.year || a.season !== b.season) continue;
      if (!daysOverlap(a.days, b.days)) continue;

      const startA = parseTimeToMinutes(a.startTime);
      const endA   = parseTimeToMinutes(a.endTime);
      const startB = parseTimeToMinutes(b.startTime);
      const endB   = parseTimeToMinutes(b.endTime);

      if (startA < endB && startB < endA) {
        errors.push({
          type:    "TIME_CONFLICT" as const,
          message: `Time conflict between sections ${a.id} and ${b.id}`,
        });
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// validateCourseAddition
// ---------------------------------------------------------------------------

/**
 * Validates adding a single course to a semester.  Checks:
 *   1. Prerequisites satisfied.
 *   2. Adding the course would not exceed the per-semester maximum (18).
 *   3. Time conflict with existing sections (when section data is provided).
 *
 * NOTE: the per-semester minimum is NOT checked here — a semester under
 * construction is expected to be incomplete.
 */
export function validateCourseAddition(
  input: CourseAdditionInput
): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Prerequisites
  errors.push(
    ...checkPrerequisites(
      input.course.code,
      input.course.prerequisiteCodes,
      input.satisfiedPrereqs
    )
  );

  // 2. Credit maximum only (semester is still being built, min not yet meaningful)
  const newTotal = input.currentSemesterCredits + input.course.credits;
  if (newTotal > MAX_SEMESTER_CREDITS) {
    errors.push({
      type:     "CREDIT_LIMIT_EXCEEDED" as const,
      message:  `Adding ${input.course.code} would bring ${input.targetSemester.season} ${input.targetSemester.year} to ${newTotal} credits, exceeding the maximum of ${MAX_SEMESTER_CREDITS}`,
      semester: input.targetSemester,
    });
  }

  // 3. Time conflicts
  if (input.currentSections && input.newSection) {
    errors.push(
      ...checkTimeConflicts([...input.currentSections, input.newSection])
    );
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// validateSchedule
// ---------------------------------------------------------------------------

/**
 * Validates a complete multi-semester schedule.  Checks (in order):
 *   1. Per-semester credit limits (min AND max).
 *   2. Prerequisites for every course across the plan.
 *   3. COLL requirements.
 *   4. Major requirements.
 *   5. Time conflicts per semester (when section data is provided).
 */
export function validateSchedule(input: FullScheduleInput): ValidationResult {
  const errors: ValidationError[] = [];

  // ── 1. Group items by semester key ───────────────────────────────────────

  const semesterMap = new Map<string, ValidatorScheduleItem[]>();
  for (const it of input.items) {
    const key = `${it.year}-${it.season}`;
    const bucket = semesterMap.get(key) ?? [];
    bucket.push(it);
    semesterMap.set(key, bucket);
  }

  // ── 2. Per-semester credit limits ────────────────────────────────────────

  for (const semItems of semesterMap.values()) {
    const { year, season } = semItems[0];
    const total = semItems.reduce((sum, si) => sum + si.credits, 0);
    errors.push(...checkSemesterCredits(total, { year, season: season as Season }));
  }

  // ── 3. Prerequisite enforcement ──────────────────────────────────────────

  for (const it of input.items) {
    const course = input.courses[it.courseCode];
    if (!course || course.prerequisiteCodes.length === 0) continue;

    const itSem = { year: it.year, season: it.season as Season };

    // All courses planned in strictly earlier semesters satisfy their prereqs
    const earlier = new Set(
      input.items
        .filter((other) =>
          isBefore(
            { year: other.year, season: other.season as Season },
            itSem
          )
        )
        .map((other) => other.courseCode)
    );

    errors.push(
      ...checkPrerequisites(it.courseCode, course.prerequisiteCodes, earlier)
    );
  }

  // ── 4. COLL requirements ─────────────────────────────────────────────────

  const allCoursesForColl = input.items.map((it) => ({
    code:          it.courseCode,
    collAttribute: input.courses[it.courseCode]?.collAttribute ?? null,
  }));
  errors.push(...checkCollRequirements(allCoursesForColl, input.collRequirements));

  // ── 5. Major requirements ────────────────────────────────────────────────

  const allCodes = new Set(input.items.map((it) => it.courseCode));
  errors.push(...checkMajorRequirements(allCodes, input.majorRequirements));

  // ── 6. Time conflicts (per semester, if section data provided) ────────────

  if (input.sections) {
    for (const semItems of semesterMap.values()) {
      const semSections: SectionTimeInfo[] = semItems
        .filter((it) => it.sectionId && input.sections![it.sectionId])
        .map((it)  => input.sections![it.sectionId!]);

      if (semSections.length >= 2) {
        errors.push(...checkTimeConflicts(semSections));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// validateGraduationProgress
// ---------------------------------------------------------------------------

/**
 * Calculates a student's progress toward graduation.
 *
 * - Only schedule items with `completed: true` count toward credit totals.
 * - For COLL requirements: looks for a completed course whose `collAttribute`
 *   matches the requirement's `collLevel`.
 * - For MAJOR/MINOR/ELECTIVE: every `requiredCourseCodes` entry must be
 *   completed.
 */
export function validateGraduationProgress(
  input: GraduationProgressInput
): GraduationProgress {
  // Completed items only
  const completedItems = input.items.filter((it) => it.completed);
  const completedCodes = new Set(completedItems.map((it) => it.courseCode));

  const completedCourseAttrs = completedItems.map((it) => ({
    code:          it.courseCode,
    collAttribute: input.courses[it.courseCode]?.collAttribute ?? null,
  }));

  const completedCredits = completedItems.reduce(
    (sum, it) => sum + it.credits,
    0
  );

  const remainingRequirements = input.requirements.map((req) => {
    let met = false;

    if (req.type === "COLL" && req.collLevel) {
      met = completedCourseAttrs.some(
        (c) => c.collAttribute === req.collLevel
      );
    } else {
      const required = req.requiredCourseCodes ?? [];
      met = required.length > 0 && required.every((code) => completedCodes.has(code));
    }

    return { name: req.name, type: req.type, met };
  });

  const percentComplete = (completedCredits / GRADUATION_CREDITS) * 100;

  return {
    completedCredits,
    requiredCredits: GRADUATION_CREDITS,
    percentComplete,
    remainingRequirements,
  };
}
