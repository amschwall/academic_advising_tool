// file: lib/generator/generator.ts

import type {
  GeneratorInput,
  GeneratorCourse,
  GeneratorResult,
  GeneratorError,
  GeneratedSemester,
  PlacedCourse,
  PlannedSemester,
  SectionOption,
  Season,
  SchedulePreferences,
} from "./types";

const MAX_SEMESTER_CREDITS = 18;
const TARGET_CREDITS = 15;

// ---------------------------------------------------------------------------
// Time parsing (12-h format → minutes since midnight)
// ---------------------------------------------------------------------------

function parseTimeToMinutes(timeStr: string): number {
  const isPm = timeStr.endsWith("pm");
  const clean = timeStr.slice(0, -2);
  const colonIdx = clean.indexOf(":");
  let hour = parseInt(clean.slice(0, colonIdx), 10);
  const min = parseInt(clean.slice(colonIdx + 1), 10);
  if (isPm && hour !== 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  return hour * 60 + min;
}

/** 9:30am in minutes — sections starting before this are "early morning". */
const EARLY_CUTOFF_MINUTES = 9 * 60 + 30;

function isEarlyMorning(startTime: string | null): boolean {
  if (!startTime) return false;
  return parseTimeToMinutes(startTime) < EARLY_CUTOFF_MINUTES;
}

function hasFriday(days: string | null): boolean {
  return days !== null && days.includes("F");
}

// ---------------------------------------------------------------------------
// Section selection
// ---------------------------------------------------------------------------

/**
 * Picks the best section for a course in a given semester.
 * Scores each section by preference violations; returns the lowest-score section.
 * Returns null when no sections exist for this course/semester combination.
 */
function pickSection(
  courseCode: string,
  sem: PlannedSemester,
  availableSections: Record<string, SectionOption[]>,
  prefs: SchedulePreferences
): string | null {
  const all = availableSections[courseCode] ?? [];
  const forSem = all.filter((s) => s.year === sem.year && s.season === sem.season);
  if (forSem.length === 0) return null;

  function score(s: SectionOption): number {
    let penalty = 0;
    if (prefs.avoidEarlyMorning && isEarlyMorning(s.startTime)) penalty++;
    if (prefs.noFridayClasses && hasFriday(s.days)) penalty++;
    return penalty;
  }

  return forSem.reduce((best, s) => (score(s) < score(best) ? s : best)).id;
}

// ---------------------------------------------------------------------------
// Course level helpers
// ---------------------------------------------------------------------------

/**
 * Extract the numeric level from a course code, e.g. "CSCI303" → 300.
 * Synthetic placeholders (no digits) return 0.
 */
function extractLevel(code: string): number {
  const m = code.match(/(\d{3})/);
  return m ? Math.floor(parseInt(m[1], 10) / 100) * 100 : 0;
}


// ---------------------------------------------------------------------------
// Semester ordering
// ---------------------------------------------------------------------------

// Academic-year order: Fall is the start of each year, Spring follows.
const SEASON_ORDER: Record<Season, number> = {
  FALL:   0,
  SPRING: 1,
  SUMMER: 2,
  WINTER: 3,
};

function semKey(year: number, season: Season): string {
  return `${year}-${season}`;
}

function semIsBefore(a: PlannedSemester, b: PlannedSemester): boolean {
  if (a.year !== b.year) return a.year < b.year;
  return SEASON_ORDER[a.season] < SEASON_ORDER[b.season];
}

// ---------------------------------------------------------------------------
// Cycle detection (Kahn's algorithm)
// ---------------------------------------------------------------------------

function detectCycle(
  courseCodes: string[],
  prereqMap: Map<string, string[]>
): boolean {
  const codeSet = new Set(courseCodes);
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const code of courseCodes) {
    inDegree.set(code, 0);
    dependents.set(code, []);
  }

  for (const code of courseCodes) {
    for (const prereq of prereqMap.get(code) ?? []) {
      if (codeSet.has(prereq)) {
        inDegree.set(code, (inDegree.get(code) ?? 0) + 1);
        dependents.get(prereq)!.push(code);
      }
    }
  }

  const queue: string[] = [];
  for (const [code, deg] of inDegree) {
    if (deg === 0) queue.push(code);
  }

  let processed = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    processed++;
    for (const dep of dependents.get(node) ?? []) {
      const newDeg = (inDegree.get(dep) ?? 0) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }

  return processed < courseCodes.length;
}

// ---------------------------------------------------------------------------
// Topological sort
// ---------------------------------------------------------------------------

function topologicalSort(
  courseCodes: string[],
  prereqMap: Map<string, string[]>,
  satisfiedCodes: Set<string>
): string[] {
  const codeSet = new Set(courseCodes);
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const code of courseCodes) {
    inDegree.set(code, 0);
    dependents.set(code, []);
  }

  for (const code of courseCodes) {
    for (const prereq of prereqMap.get(code) ?? []) {
      if (!satisfiedCodes.has(prereq) && codeSet.has(prereq)) {
        inDegree.set(code, (inDegree.get(code) ?? 0) + 1);
        dependents.get(prereq)!.push(code);
      }
    }
  }

  const queue: string[] = [];
  for (const [code, deg] of inDegree) {
    if (deg === 0) queue.push(code);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    // Among all ready nodes, process the lowest-level course first so the
    // sort output naturally orders 100-level before 200, 200 before 300, etc.
    queue.sort((a, b) => extractLevel(a) - extractLevel(b));
    const node = queue.shift()!;
    result.push(node);
    for (const dep of dependents.get(node) ?? []) {
      const newDeg = (inDegree.get(dep) ?? 0) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main: generateSchedule
// ---------------------------------------------------------------------------

export function generateSchedule(input: GeneratorInput): GeneratorResult {
  const {
    completedCourses,
    majorRequirements,
    collRequirements,
    electivePool,
    electiveCreditsNeeded,
    plannedSemesters,
    availableSections,
    preferences,
  } = input;

  const MAX_SEM_CREDITS = preferences.maxCreditsPerSemester ?? MAX_SEMESTER_CREDITS;

  const errors: GeneratorError[] = [];

  const completedCodes = new Set(completedCourses.map((c) => c.code));

  // COLL courses not yet completed
  const collCourses = collRequirements
    .map((r) => r.course)
    .filter((c) => !completedCodes.has(c.code));

  // All required courses to place (major + COLL, excluding completed)
  const required: GeneratorCourse[] = [
    ...majorRequirements.filter((c) => !completedCodes.has(c.code)),
    ...collCourses,
  ];

  // Deduplicate: COLL course might also appear in majorRequirements
  const seenCodes = new Set<string>();
  const dedupedRequired: GeneratorCourse[] = [];
  for (const c of required) {
    if (!seenCodes.has(c.code)) {
      seenCodes.add(c.code);
      dedupedRequired.push(c);
    }
  }

  // ── 1. Season availability ────────────────────────────────────────────────

  const plannedSeasons = new Set(plannedSemesters.map((s) => s.season));

  for (const course of dedupedRequired) {
    if (!course.seasons.some((s) => plannedSeasons.has(s))) {
      errors.push({
        type: "COURSE_NOT_AVAILABLE",
        message: `${course.code} is offered only in ${course.seasons.join("/")} but no such semester is planned`,
        courseCode: course.code,
      });
    }
  }

  // ── 2. Credit feasibility ─────────────────────────────────────────────────

  const totalRequired = dedupedRequired.reduce((s, c) => s + c.credits, 0);
  const maxCapacity = plannedSemesters.length * MAX_SEM_CREDITS;

  if (totalRequired > maxCapacity) {
    errors.push({
      type: "CANNOT_FIT_COURSES",
      message: `Required courses total ${totalRequired} credits, exceeding the ${plannedSemesters.length}-semester capacity of ${maxCapacity}`,
    });
  }

  if (errors.length > 0) return { success: false, errors };

  // ── 3. Cycle detection ────────────────────────────────────────────────────

  const prereqMap = new Map<string, string[]>();
  for (const c of dedupedRequired) prereqMap.set(c.code, c.prerequisiteCodes);

  if (detectCycle(dedupedRequired.map((c) => c.code), prereqMap)) {
    return {
      success: false,
      errors: [{
        type: "PREREQUISITE_CYCLE",
        message: "Circular prerequisite dependency detected among required courses",
      }],
    };
  }

  // ── 4. Topological sort ───────────────────────────────────────────────────

  const sortedCodes = topologicalSort(
    dedupedRequired.map((c) => c.code),
    prereqMap,
    completedCodes
  );

  const courseMap = new Map<string, GeneratorCourse>();
  for (const c of dedupedRequired) courseMap.set(c.code, c);

  // COLL 100 and COLL 150 must land in the first 4 planned semesters (years 1–2)
  const earlyCollCodes = new Set(
    collRequirements
      .filter((r) => r.level === "COLL 100" || r.level === "COLL 150")
      .map((r) => r.course.code)
      .filter((code) => !completedCodes.has(code))
  );

  // ── 5. Per-semester credit tracking ──────────────────────────────────────

  const semCredits = new Map<string, number>();
  const semCourseList = new Map<string, PlacedCourse[]>();

  for (const sem of plannedSemesters) {
    const key = semKey(sem.year, sem.season);
    semCredits.set(key, 0);
    semCourseList.set(key, []);
  }

  const placedCodes = new Set<string>(completedCodes);

  const hasPrefs = !!(preferences.avoidEarlyMorning || preferences.noFridayClasses);

  /**
   * Returns true when all prereqs of `code` are placed in semesters that come
   * strictly before `targetSem`.
   */
  function prereqsSatisfiedBefore(code: string, targetSem: PlannedSemester): boolean {
    for (const prereq of prereqMap.get(code) ?? []) {
      if (completedCodes.has(prereq)) continue; // completed courses precede all planned sems
      if (!placedCodes.has(prereq)) return false;
      // Verify the prereq is in a semester before targetSem
      let foundEarlier = false;
      for (const [key, courses] of semCourseList) {
        if (courses.some((c) => c.code === prereq)) {
          const dashIdx = key.indexOf("-");
          const prereqSem: PlannedSemester = {
            year: parseInt(key.slice(0, dashIdx), 10),
            season: key.slice(dashIdx + 1) as Season,
          };
          if (semIsBefore(prereqSem, targetSem)) {
            foundEarlier = true;
            break;
          }
        }
      }
      if (!foundEarlier) return false;
    }
    return true;
  }

  /**
   * Finds eligible semesters for `course`:
   *   - season matches
   *   - under 18-credit cap
   *   - all prereqs in strictly earlier semesters
   *   - COLL 100/150 only in first 4 semesters
   *   - if preferences + sections exist, prefer semesters with matching sections
   */
  function findRequiredSemester(
    course: GeneratorCourse,
    isEarlyColl: boolean
  ): PlannedSemester | null {
    const courseLevel = extractLevel(course.code);

    // Level-ordering constraint: find the latest semester in which any
    // already-placed required course of a lower level sits. This course must
    // go in a strictly later semester — you finish lower-level work first,
    // regardless of which calendar year that falls in.
    let mustBeAfter: PlannedSemester | null = null;
    if (courseLevel > 0) {
      for (const [key, placed] of semCourseList) {
        const hasLower = placed.some((c) => {
          const l = extractLevel(c.code);
          return l > 0 && l < courseLevel;
        });
        if (!hasLower) continue;
        const dashIdx = key.indexOf("-");
        const sem: PlannedSemester = {
          year:   parseInt(key.slice(0, dashIdx), 10),
          season: key.slice(dashIdx + 1) as Season,
        };
        if (mustBeAfter === null || semIsBefore(mustBeAfter, sem)) mustBeAfter = sem;
      }
    }

    function baseFilter(sem: PlannedSemester, idx: number): boolean {
      if (!course.seasons.includes(sem.season)) return false;
      const key = semKey(sem.year, sem.season);
      if ((semCredits.get(key) ?? 0) + course.credits > MAX_SEM_CREDITS) return false;
      if (isEarlyColl && idx >= 4) return false;
      return prereqsSatisfiedBefore(course.code, sem);
    }

    // Apply level constraint: only consider semesters after mustBeAfter.
    // If that leaves nothing (e.g. very short plan), fall back to base filter.
    let eligible = plannedSemesters.filter((sem, idx) => {
      if (mustBeAfter !== null && !semIsBefore(mustBeAfter, sem)) return false;
      return baseFilter(sem, idx);
    });
    if (eligible.length === 0) {
      eligible = plannedSemesters.filter(baseFilter);
    }

    if (eligible.length === 0) return null;

    // If preferences are set and sections exist, prefer semesters with available sections
    const sections = availableSections[course.code] ?? [];
    const pool = (hasPrefs && sections.length > 0)
      ? eligible.filter((sem) => sections.some((s) => s.year === sem.year && s.season === sem.season))
      : [];
    const candidates = pool.length > 0 ? pool : eligible;

    // Distribute required courses evenly: always choose the eligible semester with
    // the lowest current credit load. This prevents courses from piling into the
    // first semester when all semesters start empty.
    return candidates.reduce((best, s) => {
      const bc = semCredits.get(semKey(best.year, best.season)) ?? 0;
      const sc = semCredits.get(semKey(s.year, s.season)) ?? 0;
      return sc < bc ? s : best;
    });
  }

  /**
   * For electives: pick the eligible semester with the lowest current credit count
   * (fills gaps left by required courses). Falls back to any eligible if all are at target.
   */
  function findElectiveSemester(course: GeneratorCourse): PlannedSemester | null {
    const eligible = plannedSemesters.filter((sem) => {
      if (!course.seasons.includes(sem.season)) return false;
      const key = semKey(sem.year, sem.season);
      return (semCredits.get(key) ?? 0) + course.credits <= MAX_SEM_CREDITS;
    });
    if (eligible.length === 0) return null;
    return eligible.reduce((best, s) => {
      const bc = semCredits.get(semKey(best.year, best.season)) ?? 0;
      const sc = semCredits.get(semKey(s.year, s.season)) ?? 0;
      return sc < bc ? s : best;
    });
  }

  function placeCourse(course: GeneratorCourse, sem: PlannedSemester): void {
    const key = semKey(sem.year, sem.season);
    const sectionId = pickSection(course.code, sem, availableSections, preferences);
    semCourseList.get(key)!.push({
      code: course.code,
      credits: course.credits,
      recommendedSectionId: sectionId,
    });
    semCredits.set(key, (semCredits.get(key) ?? 0) + course.credits);
    placedCodes.add(course.code);
  }

  // ── 6. Place required courses (topological + level order) ────────────────

  for (const code of sortedCodes) {
    const course = courseMap.get(code)!;
    const isEarlyColl = earlyCollCodes.has(code);
    const sem = findRequiredSemester(course, isEarlyColl);
    if (sem) placeCourse(course, sem);
  }

  // ── 6b. Guarantee every required course is placed ─────────────────────────
  // Level-ordering or prerequisite constraints may have left some courses
  // unplaced. Retry them with only the capacity constraint — level ordering is
  // dropped so every required course is guaranteed a slot, even if the ideal
  // ordering can't be achieved with the available semesters.
  for (const code of sortedCodes) {
    if (placedCodes.has(code)) continue;
    const course = courseMap.get(code)!;
    const eligible = plannedSemesters.filter((sem) => {
      if (!course.seasons.includes(sem.season)) return false;
      const key = semKey(sem.year, sem.season);
      return (semCredits.get(key) ?? 0) + course.credits <= MAX_SEM_CREDITS;
    });
    if (eligible.length === 0) continue;
    const sem = eligible.reduce((best, s) => {
      const bc = semCredits.get(semKey(best.year, best.season)) ?? 0;
      const sc = semCredits.get(semKey(s.year, s.season)) ?? 0;
      return sc < bc ? s : best;
    });
    placeCourse(course, sem);
  }

  // ── 7. Fill with major-specific electives up to electiveCreditsNeeded ─────

  let electivePlaced = 0;
  const usedElective = new Set<string>();

  for (const elective of electivePool) {
    if (electivePlaced >= electiveCreditsNeeded) break;
    if (usedElective.has(elective.code) || placedCodes.has(elective.code)) continue;

    const sem = findElectiveSemester(elective);
    if (!sem) continue;

    placeCourse(elective, sem);
    usedElective.add(elective.code);
    electivePlaced += elective.credits;
  }

  // ── 8. Fill remaining semester capacity with general courses ───────────────
  // Bring every semester up to TARGET_CREDITS using the fillPool (all catalog
  // courses), so the generated schedule has a balanced load across all semesters.

  const fillPool = input.fillPool ?? [];

  for (const course of fillPool) {
    if (placedCodes.has(course.code)) continue;

    // Find the semester with the lowest load that is still under TARGET_CREDITS
    const eligible = plannedSemesters.filter((sem) => {
      if (!course.seasons.includes(sem.season)) return false;
      const key = semKey(sem.year, sem.season);
      const cur = semCredits.get(key) ?? 0;
      return cur < TARGET_CREDITS && cur + course.credits <= MAX_SEM_CREDITS;
    });
    if (eligible.length === 0) continue;

    const target = eligible.reduce((best, s) => {
      const bc = semCredits.get(semKey(best.year, best.season)) ?? 0;
      const sc = semCredits.get(semKey(s.year, s.season)) ?? 0;
      return sc < bc ? s : best;
    });

    placeCourse(course, target);
  }

  // ── 9. Build result ───────────────────────────────────────────────────────

  const completedCredits = completedCourses.reduce((s, c) => s + c.credits, 0);

  const semesters: GeneratedSemester[] = plannedSemesters.map((sem) => {
    const key = semKey(sem.year, sem.season);
    const courses = semCourseList.get(key) ?? [];
    return {
      year: sem.year,
      season: sem.season,
      courses,
      totalCredits: courses.reduce((s, c) => s + c.credits, 0),
    };
  });

  const totalCredits =
    semesters.reduce((s, sem) => s + sem.totalCredits, 0) + completedCredits;

  return { success: true, plan: { semesters, totalCredits } };
}
