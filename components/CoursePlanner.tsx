// file: components/CoursePlanner.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { usePlannerStore, type PlannedCourse, type Semester } from "@/lib/stores/plannerStore";
import { RequirementTracker } from "@/components/RequirementTracker";
import { ChatPanel } from "@/components/ChatPanel";
import { useWhatIfStore } from "@/lib/stores/whatIfStore";
import type { GeneratorInput, GeneratedPlan, Season } from "@/lib/generator/types";
import {
  MAJORS,
  MINORS,
  CONCENTRATIONS,
  COLL_CURRICULUM,
  type ProgramDefinition,
} from "@/lib/data/majors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Course {
  code: string;
  title: string;
  credits: number;
  prerequisiteCodes: string[];
  sections: { crn?: string; season?: string; professor: string; location: string; days: string; startTime?: string | null; endTime?: string | null }[];
  collAttribute?: string | null;
  alv?: boolean;
  csi?: boolean;
  nqr?: boolean;
  department?: string;
  majorRestriction?: string | null;
}

interface Notification {
  type: "error" | "warning" | "success";
  message: string;
}

/** Optional overrides for handleGenerate — used by the what-if "Generate Schedule" path. */
interface GenerateOverrides {
  major?: string;
  secondMajor?: string;
  minor?: string;
  concentration?: string;
}

// ---------------------------------------------------------------------------
// Helpers for building GeneratorInput from selected programs
// ---------------------------------------------------------------------------

/** Extract the numeric course level from a course code, e.g. "CSCI303" → 303. */
function extractCourseLevel(code: string): number {
  const m = code.match(/(\d{3})/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Build majorRequirements from a list of selected ProgramDefinitions.
 *
 * Every requirement — specific courses, credit-hour requirements, AND gen-ed
 * attribute requirements — produces guaranteed entries in majorRequirements so
 * the generator places ALL of them. No requirement is left to the elective pool
 * where it could be skipped.
 *
 * - CourseRequirement   → direct entry in majorRequirements
 * - CreditRequirement   → pick enough matching catalog courses; if the filtered
 *                         catalog has insufficient courses, synthesize placeholders.
 *                         Requirements WITH a dept/level filter count existing
 *                         majorRequirements courses as partial coverage (double-
 *                         dipping allowed, e.g. CSCI303 satisfies both the CS
 *                         upper-div requirement and COLL 300). Requirements with
 *                         NO filter (e.g. COLL 100/150 seminars) are always
 *                         synthesized since they represent courses not in the
 *                         simplified catalog.
 * - AttributeRequirement → find `count` catalog courses with the matching gen-ed
 *                         boolean flag (alv/csi/nqr); synthesize any that are missing.
 *
 * syntheticFallback: synthetic placeholder Course objects keyed by code.
 * The caller must merge these into the courseByCode lookup used for UI placement.
 */
/**
 * Returns the set of department codes the student has access to based on their
 * selected programs. A course whose majorRestriction matches one of these
 * departments is eligible; all others are filtered out of auto-placed slots.
 */
function getMajorDepartments(programs: ProgramDefinition[]): Set<string> {
  const depts = new Set<string>();
  for (const p of programs) {
    for (const req of p.requirements) {
      if (req.type === "credits" && req.departments) {
        req.departments.forEach((d) => depts.add(d));
      }
      if (req.type === "course") {
        const m = req.code.match(/^([A-Z]+)/);
        if (m) depts.add(m[1]);
      }
    }
  }
  return depts;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

const CALENDAR_START_MIN = 6 * 60;   // 6:00 AM
const CALENDAR_END_MIN   = 22 * 60;  // 10:00 PM
const CALENDAR_RANGE     = CALENDAR_END_MIN - CALENDAR_START_MIN; // 960 min
const PX_PER_MIN         = 1;        // 1 px per minute → 60 px/hr, 960 px total
const UNSCHEDULED_MIN    = 6 * 60 + 30; // 6:30 AM — no real class scheduled here
const UNSCHEDULED_HEIGHT = 40;       // px height for time-less blocks

const CALENDAR_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

/**
 * Parse a meeting-days string (e.g. "MWF", "TR", "TuTh") into
 * day-of-week indices: 0 = Mon … 4 = Fri.
 */
function parseDays(daysStr: string | null | undefined): number[] {
  if (!daysStr || daysStr.toUpperCase() === "TBA") return [];
  const days = new Set<number>();
  // Replace multi-char tokens first to avoid double-counting single letters.
  const s = daysStr
    .replace(/Tu/gi, "\x01")  // Tue placeholder
    .replace(/Th/gi, "\x02")  // Thu placeholder
    .replace(/Sa/gi, "")
    .replace(/Su/gi, "");
  if (s.includes("\x01"))                              days.add(1); // Tue
  if (s.includes("\x02") || /R/i.test(s))             days.add(3); // Thu
  if (/M/i.test(s))                                   days.add(0); // Mon
  if (/T/i.test(s.replace(/\x01/g, "")))              days.add(1); // bare T = Tue
  if (/W/i.test(s))                                   days.add(2); // Wed
  if (/F/i.test(s))                                   days.add(4); // Fri
  return [...days].sort((a, b) => a - b);
}

/** Convert "9:00 AM" / "1:30 PM" to total minutes from midnight. */
function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function formatHour(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  if (h === 0)  return "12 AM";
  if (h < 12)  return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function buildRequirementsFromPrograms(
  programs: ProgramDefinition[],
  availableCourses: Course[],
  completedCodes: Set<string> = new Set(),
): {
  majorRequirements:    GeneratorInput["majorRequirements"];
  electivePool:         GeneratorInput["electivePool"];
  electiveCreditsNeeded: number;
  syntheticFallback:    Map<string, Course>;
} {
  const courseMap         = new Map(availableCourses.map((c) => [c.code, c]));
  const majorDepts        = getMajorDepartments(programs);
  // All departments that correspond to a known program — courses from any other
  // department (e.g. LAW) are treated as restricted to their own school.
  const allKnownDepts     = getMajorDepartments([...MAJORS, ...MINORS, ...CONCENTRATIONS]);
  // Shuffle once so all catalog-fallback and gen-ed loops pick randomly,
  // and pre-filter to exclude courses restricted to a major the student isn't in.
  const shuffledCourses   = shuffle(
    availableCourses.filter((c) => {
      if (c.majorRestriction) return majorDepts.has(c.majorRestriction);
      // No explicit restriction: allow only courses from known program departments
      // or courses with gen-ed / COLL flags (open to all students).
      return allKnownDepts.has(c.department ?? "") ||
             majorDepts.has(c.department ?? "") ||
             c.alv || c.csi || c.nqr || !!c.collAttribute;
    })
  );
  const seenRequired      = new Set<string>();
  const seenElective      = new Set<string>();
  const syntheticFallback = new Map<string, Course>();
  const majorRequirements: GeneratorInput["majorRequirements"] = [];
  const electivePool:      GeneratorInput["electivePool"]      = [];
  let electiveCreditsNeeded = 0;
  let synIdx = 0;

  function toGenCourse(c: Course): GeneratorInput["majorRequirements"][number] {
    return {
      code:              c.code,
      credits:           c.credits,
      prerequisiteCodes: c.prerequisiteCodes,
      collAttribute:     c.collAttribute ?? null,
      seasons:           ["FALL", "SPRING"] as Season[],
    };
  }

  function addRequired(entry: GeneratorInput["majorRequirements"][number]) {
    if (seenRequired.has(entry.code)) return;
    // If this course was tentatively chosen as an elective, promote it to
    // required (hard requirement always takes precedence).
    if (seenElective.has(entry.code)) {
      const idx = electivePool.findIndex((e) => e.code === entry.code);
      if (idx >= 0) {
        electiveCreditsNeeded -= electivePool[idx].credits;
        electivePool.splice(idx, 1);
      }
      seenElective.delete(entry.code);
    }
    seenRequired.add(entry.code);
    majorRequirements.push(entry);
  }

  function addElective(entry: GeneratorInput["electivePool"][number]) {
    if (seenRequired.has(entry.code) || seenElective.has(entry.code)) return;
    seenElective.add(entry.code);
    electivePool.push(entry);
    electiveCreditsNeeded += entry.credits;
  }

  /** Create a synthetic placeholder course and add it to majorRequirements. */
  function addSynthetic(credits: number, label: string, tag: string) {
    synIdx++;
    const code = `SYN-${tag}-${synIdx}`;
    const syn: Course = {
      code,
      title:             label,
      credits,
      prerequisiteCodes: [],
      sections:          [],
      collAttribute:     null,
    };
    syntheticFallback.set(code, syn);
    seenRequired.add(code);
    majorRequirements.push(toGenCourse(syn));
  }

  for (const program of programs) {
    for (const req of program.requirements) {

      // ── Specific required course ──────────────────────────────────────────
      if (req.type === "course") {
        const found = courseMap.get(req.code);
        addRequired({
          code:              req.code,
          credits:           req.credits,
          // Static prerequisiteCodes from majors.ts take precedence; fall back to DB data
          prerequisiteCodes: req.prerequisiteCodes ?? found?.prerequisiteCodes ?? [],
          collAttribute:     found?.collAttribute ?? null,
          seasons:           ["FALL", "SPRING"] as Season[],
        });

      // ── Credit-hour requirement ───────────────────────────────────────────
      // Elective selections go into electivePool (placed AFTER required courses),
      // so required courses are always distributed evenly across semesters first.
      } else if (req.type === "credits") {
        const hasFilter = !!(req.departments || req.minLevel);
        let covered = 0;

        if (hasFilter) {
          // Count existing majorRequirements that already satisfy this filter
          // (allows legitimate double-dipping, e.g. CSCI303 → COLL 300).
          for (const entry of majorRequirements) {
            if (syntheticFallback.has(entry.code)) continue;
            const real = courseMap.get(entry.code);
            if (!real) continue;
            if (req.departments && !req.departments.includes(real.department ?? "")) continue;
            if (req.minLevel && extractCourseLevel(entry.code) < req.minLevel) continue;
            covered += entry.credits;
          }

          const netNeeded = req.credits - covered;
          if (netNeeded > 0) {
            if (req.electiveCourses && req.electiveCourses.length > 0) {
              // Approved elective list — sort by level so lower-level courses
              // (and their prereqs) are processed first, then shuffle within each level.
              const byLevel = [...req.electiveCourses].sort(
                (a, b) => extractCourseLevel(a.code) - extractCourseLevel(b.code)
              );
              let electiveCovered = 0;
              // Two passes: first pass respects prereq constraints; second pass
              // relaxes them (adds course without prereq filtering) to ensure
              // credit requirements are always fully covered.
              for (let pass = 0; pass < 2 && electiveCovered < netNeeded; pass++) {
                for (const elec of byLevel) {
                  if (electiveCovered >= netNeeded) break;
                  if (seenRequired.has(elec.code) || seenElective.has(elec.code)) continue;
                  const dbCourse = courseMap.get(elec.code);
                  const prereqs  = dbCourse?.prerequisiteCodes ?? [];
                  // Pass 0: prereqs must already be required or elected or completed.
                  // Pass 1: relax — accept any remaining approved elective.
                  if (pass === 0 && prereqs.some(
                    (p) => !seenRequired.has(p) && !seenElective.has(p) && !completedCodes.has(p)
                  )) continue;
                  const genCourse = dbCourse
                    ? toGenCourse(dbCourse)
                    : { code: elec.code, credits: elec.credits, prerequisiteCodes: [], collAttribute: null, seasons: ["FALL", "SPRING"] as Season[] };
                  addElective(genCourse);
                  if (!dbCourse) {
                    syntheticFallback.set(elec.code, {
                      code: elec.code, title: elec.title, credits: elec.credits,
                      prerequisiteCodes: [], sections: [], collAttribute: null,
                    });
                  }
                  electiveCovered += elec.credits;
                }
              }
              // Synthetic fallback: if still short, add a placeholder so the credit
              // requirement is always fully represented in the generated schedule.
              if (electiveCovered < netNeeded) {
                addSynthetic(netNeeded - electiveCovered, req.description, "ELEC");
              }
            } else if (req.singleDepartment && req.departments && req.departments.length > 0) {
              // Single-department sequential requirement (e.g. foreign language).
              // Pick ONE department at random, then add its courses in level order
              // so the generator enforces 101 → 102 → 201 → 202 sequencing.
              const shuffledDepts = shuffle([...req.departments]);
              let electiveCovered = 0;

              for (const dept of shuffledDepts) {
                if (electiveCovered >= netNeeded) break;

                // All available courses from this department, sorted by level ascending.
                const deptCourses = shuffledCourses
                  .filter(
                    (c) =>
                      c.department === dept &&
                      !seenRequired.has(c.code) &&
                      !seenElective.has(c.code) &&
                      extractCourseLevel(c.code) < 500
                  )
                  .sort((a, b) => extractCourseLevel(a.code) - extractCourseLevel(b.code));

                if (deptCourses.length === 0) continue;

                // Build the chain in level order. Allow a course whose prereq is
                // already in `tentative` (i.e. FREN 102 can follow FREN 101 even
                // though FREN 101 is not yet in seenRequired/seenElective).
                const tentative: GeneratorInput["electivePool"][number][] = [];
                let deptCovered = 0;
                for (const course of deptCourses) {
                  if (deptCovered >= netNeeded) break;
                  const prereqsOk = course.prerequisiteCodes.every(
                    (p) =>
                      seenRequired.has(p) ||
                      seenElective.has(p) ||
                      completedCodes.has(p) ||
                      tentative.some((t) => t.code === p)
                  );
                  if (!prereqsOk) continue;
                  tentative.push(toGenCourse(course));
                  deptCovered += course.credits;
                }

                if (tentative.length === 0) continue;

                // Commit: add the chosen department's sequence to the elective pool.
                for (const entry of tentative) {
                  addElective(entry);
                  electiveCovered += entry.credits;
                }
                break; // Only one language department per schedule.
              }

              // Synthetic fallback: if no language courses were found (e.g. not yet
              // in the catalog), add a placeholder so the credit block is still represented.
              if (electiveCovered < netNeeded) {
                addSynthetic(netNeeded - electiveCovered, req.description, "LANG");
              }
            } else {
              // No approved list — fall back to catalog filtering.
              // We intentionally do NOT check prereqs here: the generator filters
              // its prereqMap to known-course codes only, so unknown DB prereqs
              // are ignored and will not block placement.  Checking prereqs here
              // would unnecessarily exclude valid courses (e.g. every HIST 300+
              // course would be skipped by a CS student because HIST 101 is not
              // in their seenRequired/seenElective).
              let electiveCovered = 0;
              for (const course of shuffledCourses) {
                if (electiveCovered >= netNeeded) break;
                if (seenRequired.has(course.code) || seenElective.has(course.code)) continue;
                // Only place elective/gen-ed catalog courses at the 100/200 level.
                if (extractCourseLevel(course.code) > 200) continue;
                if (req.departments && !req.departments.includes(course.department ?? "")) continue;
                if (req.minLevel && extractCourseLevel(course.code) < req.minLevel) continue;
                addElective(toGenCourse(course));
                electiveCovered += course.credits;
              }
              // Synthetic fallback if catalog didn't have enough matching courses.
              if (electiveCovered < netNeeded) {
                addSynthetic(netNeeded - electiveCovered, req.description, "ELEC");
              }
            }
          }
        } else {
          // No-filter requirements (e.g. COLL seminars) represent distinct structured
          // experiences not in the regular catalog — synthesize required placeholders.
          let rem = req.credits;
          while (rem > 0) {
            const cr  = Math.min(rem, 3);
            const tag = `COLL`;
            addSynthetic(cr, req.description, tag);
            rem -= cr;
          }
        }

      // ── Gen-ed attribute requirement (ALV / CSI / NQR) ───────────────────
      // These are required (student must earn this gen-ed), so they go in
      // majorRequirements, not the elective pool.
      } else {
        let addedCount = 0;

        for (const course of shuffledCourses) {
          if (addedCount >= req.count) break;
          if (seenRequired.has(course.code)) continue;
          // Only satisfy gen-ed requirements with 100/200-level courses.
          if (extractCourseLevel(course.code) > 200) continue;

          const flagMap: Record<string, keyof Course> = { alv: "alv", csi: "csi", nqr: "nqr" };
          const flagKey = flagMap[req.attribute.toLowerCase()];
          const matches = flagKey
            ? !!course[flagKey]
            : course.collAttribute === req.attribute;
          if (!matches) continue;

          addRequired(toGenCourse(course));
          addedCount++;
        }

        for (let i = addedCount; i < req.count; i++) {
          addSynthetic(req.credits, req.description, req.attribute);
        }
      }
    }
  }

  // ── Transitive prerequisite closure ────────────────────────────────────────
  // Pull in any prereqs of required courses that aren't yet in the plan.
  // We only run the closure over majorRequirements — elective prereqs were
  // already validated (only electives whose prereqs are in seenRequired were
  // added), so their chains are already covered.
  {
    let changed = true;
    while (changed) {
      changed = false;
      for (const req of [...majorRequirements]) {
        if (syntheticFallback.has(req.code)) continue;
        for (const prereqCode of req.prerequisiteCodes) {
          if (seenRequired.has(prereqCode)) continue;
          const prereqCourse = courseMap.get(prereqCode);
          if (!prereqCourse) continue;
          addRequired(toGenCourse(prereqCourse));
          changed = true;
        }
      }
    }
  }

  // Required courses are guaranteed placement (step 6 of the generator).
  // Electives fill remaining space afterward (step 7), ensuring required
  // courses are spread evenly across semesters before any elective lands.
  return {
    majorRequirements,
    electivePool,
    electiveCreditsNeeded,
    syntheticFallback,
  };
}

// ---------------------------------------------------------------------------
// DraggableCourseCard — shown in the course pool
// ---------------------------------------------------------------------------

function DraggableCourseCard({
  course,
  isPlaced,
}: {
  course: Course;
  isPlaced: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: course.code,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={`course-card-${course.code}`}
      data-dragging={isDragging ? "true" : undefined}
      data-placed={isPlaced ? "true" : undefined}
      className={[
        "group relative rounded-xl border p-3 select-none transition-all duration-150",
        "cursor-grab active:cursor-grabbing",
        isDragging
          ? "opacity-40 shadow-xl ring-2 ring-green-400 scale-95"
          : "hover:shadow-md hover:-translate-y-px",
        isPlaced
          ? "bg-green-50 border-green-200"
          : "bg-white border-gray-200 hover:border-green-300",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800 leading-snug">
            {course.title}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{course.code}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
            {course.credits} cr
          </span>
          {course.collAttribute && (
            <span className="rounded-md bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
              {course.collAttribute}
            </span>
          )}
        </div>
      </div>

      {isPlaced && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-green-600">
          <span>✓</span>
          <span>Placed</span>
        </p>
      )}

      {/* Subtle drag-handle dots, visible on hover */}
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 text-base">
        ⋮⋮
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlacedCourseCard — shown inside a semester drop zone
// ---------------------------------------------------------------------------

function PlacedCourseCard({
  course,
  semesterId,
}: {
  course: PlannedCourse;
  semesterId: string;
}) {
  const removeCourse      = usePlannerStore((s) => s.removeCourse);
  const setCourseStatus   = usePlannerStore((s) => s.setCourseStatus);
  const [expanded, setExpanded] = useState(false);

  const genEdBadges: string[] = [];
  if (course.collAttribute) genEdBadges.push(course.collAttribute);
  if (course.alv)           genEdBadges.push("ALV");
  if (course.csi)           genEdBadges.push("CSI");
  if (course.nqr)           genEdBadges.push("NQR");

  const status = course.status ?? "planned";
  const cardCls =
    status === "completed"   ? "border-green-200  bg-green-50  border-l-green-500"  :
    status === "in-progress" ? "border-yellow-200 bg-yellow-50 border-l-yellow-500" :
                               "border-blue-100   bg-blue-50   border-l-blue-400";
  const titleCls =
    status === "completed"   ? "text-green-900"  :
    status === "in-progress" ? "text-yellow-900" :
                               "text-blue-900";
  const subtitleCls =
    status === "completed"   ? "text-green-600"  :
    status === "in-progress" ? "text-yellow-600" :
                               "text-blue-500";

  return (
    <div className={`rounded-lg border border-l-2 shadow-sm ${cardCls}`}>
      {/* ── Summary row ── */}
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          aria-label={expanded ? `Collapse ${course.code}` : `Expand ${course.code}`}
          onClick={() => setExpanded((v) => !v)}
          className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-300
                     transition-colors hover:bg-gray-100 hover:text-gray-500"
        >
          <svg
            className={`h-3 w-3 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium ${titleCls}`}>{course.title}</p>
          <p className={`text-xs ${subtitleCls}`}>
            {course.code} &middot; {course.credits} cr
            {course.department && ` · ${course.department}`}
          </p>
        </div>

        <button
          aria-label={`Remove ${course.code}`}
          onClick={() => removeCourse(semesterId, course.code)}
          className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-300
                     transition-colors hover:bg-red-50 hover:text-red-400"
        >
          ✕
        </button>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 pb-2.5 pt-2 text-xs text-gray-500 space-y-1.5">
          {/* Status selector */}
          <div className="flex items-center gap-1">
            {(["planned", "in-progress", "completed"] as const).map((s) => {
              const active = (course.status ?? "planned") === s;
              const cls = s === "planned"
                ? active ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "text-gray-400 hover:bg-gray-100"
                : s === "in-progress"
                ? active ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300" : "text-gray-400 hover:bg-gray-100"
                : active ? "bg-green-100 text-green-700 ring-1 ring-green-300" : "text-gray-400 hover:bg-gray-100";
              return (
                <button
                  key={s}
                  onClick={() => setCourseStatus(semesterId, course.code, s)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors ${cls}`}
                >
                  {s === "in-progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              );
            })}
          </div>

          {/* Gen-ed badges */}
          {genEdBadges.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {genEdBadges.map((b) => (
                <span
                  key={b}
                  className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700"
                >
                  {b}
                </span>
              ))}
            </div>
          )}

          {/* Prerequisites */}
          {course.prerequisiteCodes.length > 0 && (
            <p>
              <span className="font-medium text-gray-600">Prereqs: </span>
              {course.prerequisiteCodes.join(", ")}
            </p>
          )}

          {/* Sections */}
          {course.sections.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-gray-600">Sections:</p>
              {course.sections.map((s, i) => {
                const time =
                  s.startTime && s.endTime ? `${s.startTime}–${s.endTime}`
                  : s.startTime            ? s.startTime
                  : null;
                return (
                  <div key={i} className="ml-2 leading-relaxed">
                    {s.professor !== "TBA" && <span>{s.professor}</span>}
                    {s.days && (
                      <span className="ml-1 text-gray-400">&middot; {s.days}</span>
                    )}
                    {time && (
                      <span className="ml-1 text-gray-400">&middot; {time}</span>
                    )}
                    {s.location && s.location !== "TBA" && (
                      <span className="ml-1 text-gray-400">&middot; {s.location}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="italic text-gray-400">No section info available</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CalendarCourseBlock — a course block on the weekly calendar
// ---------------------------------------------------------------------------

const BLOCK_CLS: Record<string, string> = {
  "planned":     "bg-blue-100 border-l-blue-500 text-blue-900",
  "in-progress": "bg-yellow-100 border-l-yellow-500 text-yellow-900",
  "completed":   "bg-green-100 border-l-green-600 text-green-900",
};
const BLOCK_DEFAULT = "bg-indigo-100 border-l-indigo-500 text-indigo-900";

function CalendarCourseBlock({
  course,
  semesterId,
  topPx,
  heightPx,
  unscheduled,
  colIndex = 0,
  colTotal = 1,
}: {
  course: PlannedCourse;
  semesterId: string;
  topPx: number;
  heightPx: number;
  unscheduled: boolean;
  colIndex?: number;
  colTotal?: number;
}) {
  const removeCourse = usePlannerStore((s) => s.removeCourse);
  const [open, setOpen] = useState(false);
  const status = course.status ?? "planned";
  const colorCls = BLOCK_CLS[status] ?? BLOCK_DEFAULT;

  const leftPct  = (colIndex / colTotal) * 100;
  const widthPct = (1 / colTotal) * 100;

  return (
    <div
      className={[
        "absolute cursor-pointer select-none overflow-visible",
        "rounded border-l-2 px-1.5 py-0.5 shadow-sm hover:shadow-md transition-shadow",
        unscheduled ? "opacity-60 border-dashed" : "",
        colorCls,
      ].join(" ")}
      style={{
        top: topPx,
        height: Math.max(heightPx, 18),
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        zIndex: open ? 30 : 10,
      }}
      onClick={() => setOpen((v) => !v)}
      title={`${course.code}: ${course.title}${unscheduled ? " (time TBD)" : ""}`}
    >
      <p className="truncate text-[9px] font-bold leading-tight">{course.code}</p>
      {heightPx >= 26 && (
        <p className="truncate text-[9px] leading-tight opacity-75">{course.title}</p>
      )}
      {unscheduled && heightPx >= 18 && (
        <p className="text-[8px] opacity-50 leading-tight">TBD</p>
      )}

      {/* Popover detail card */}
      {open && (
        <div
          className="absolute left-full top-0 z-40 ml-1.5 w-52 rounded-xl bg-white
                     shadow-xl ring-1 ring-gray-200 p-3 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-semibold text-gray-800 mb-0.5">{course.title}</p>
          <p className="text-gray-500 mb-2">{course.code} · {course.credits} cr</p>
          {course.sections[0] ? (
            <p className="text-gray-500 leading-relaxed">
              {course.sections[0].days}{" "}
              {course.sections[0].startTime && course.sections[0].endTime
                ? `${course.sections[0].startTime}–${course.sections[0].endTime}`
                : "Time TBD"}
              {course.sections[0].location && course.sections[0].location !== "TBA"
                ? ` · ${course.sections[0].location}`
                : ""}
            </p>
          ) : (
            <p className="italic text-gray-400">No section info</p>
          )}
          <button
            onClick={() => removeCourse(semesterId, course.code)}
            className="mt-2.5 text-[11px] text-red-400 hover:text-red-600 transition-colors"
          >
            Remove from semester
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeeklyCalendar — calendar view for a single semester
// ---------------------------------------------------------------------------

function WeeklyCalendar({
  semester,
  activeCourse,
}: {
  semester: Semester;
  activeCourse: Course | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: semester.id });
  const isPrereqSatisfied = usePlannerStore((s) => s.isPrereqSatisfied);
  const isInvalid = isOver && activeCourse !== null && !isPrereqSatisfied(semester.id, activeCourse);

  const totalHeight = CALENDAR_RANGE * PX_PER_MIN; // 960 px

  // Build per-day course blocks
  type BlockInfo = { course: PlannedCourse; topPx: number; heightPx: number; unscheduled: boolean; colIndex: number; colTotal: number };
  const coursesByDay: BlockInfo[][] = CALENDAR_DAYS.map(() => []);

  for (const course of semester.courses) {
    const section = course.sections.find((s) => s.startTime && s.endTime);
    const startMin = parseTimeToMinutes(section?.startTime) ?? UNSCHEDULED_MIN;
    const endMin   = parseTimeToMinutes(section?.endTime)   ?? startMin + 50;
    const days     = section?.days ? parseDays(section.days) : [];
    const unscheduled = !section?.startTime;

    const topPx    = (startMin - CALENDAR_START_MIN) * PX_PER_MIN;
    const heightPx = unscheduled ? UNSCHEDULED_HEIGHT : Math.max((endMin - startMin) * PX_PER_MIN, 18);

    // Unscheduled → show only in Monday column so it doesn't clutter all days
    const targetDays = unscheduled ? [0] : (days.length > 0 ? days : [0, 2, 4]);

    for (const d of targetDays) {
      if (d >= 0 && d <= 4) {
        coursesByDay[d].push({ course, topPx, heightPx, unscheduled, colIndex: 0, colTotal: 1 });
      }
    }
  }

  // Assign side-by-side column slots to all unscheduled blocks in Monday column
  const mondayUnscheduled = coursesByDay[0].filter((b) => b.unscheduled);
  if (mondayUnscheduled.length > 1) {
    mondayUnscheduled.forEach((b, i) => {
      b.colIndex = i;
      b.colTotal = mondayUnscheduled.length;
    });
  }

  const hours = Array.from({ length: CALENDAR_RANGE / 60 }, (_, i) => CALENDAR_START_MIN + i * 60);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* ── Day header ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-gray-200 bg-white">
        <div className="w-14 shrink-0 border-r border-gray-100 bg-white" />
        {CALENDAR_DAYS.map((day) => (
          <div
            key={day}
            className="flex-1 border-r border-gray-100 py-2 text-center text-xs font-semibold text-gray-500 last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      {/* ── Semester label + drop state ────────────────────────────────── */}
      <div
        className={[
          "shrink-0 border-b px-4 py-1.5 text-xs font-medium transition-colors",
          isInvalid
            ? "border-red-200 bg-red-50 text-red-600"
            : isOver
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-gray-100 bg-white text-gray-500",
        ].join(" ")}
      >
        {isInvalid
          ? "Prerequisite not met — cannot add here"
          : isOver
          ? `Drop to add to ${semester.label}`
          : `${semester.label} · ${semester.courses.reduce((s, c) => s + c.credits, 0)} credits`}
      </div>

      {/* ── Scrollable grid ────────────────────────────────────────────── */}
      <div
        ref={setNodeRef}
        className={[
          "flex flex-1 overflow-y-auto transition-colors",
          isInvalid ? "bg-red-50" : isOver ? "bg-green-50/40" : "bg-white",
        ].join(" ")}
      >
        {/* Time axis */}
        <div
          className="relative w-14 shrink-0 border-r border-gray-100 bg-white"
          style={{ minHeight: totalHeight }}
        >
          {hours.map((minFromMidnight) => (
            <div
              key={minFromMidnight}
              className="absolute right-1.5 text-[9px] leading-none text-gray-400"
              style={{ top: (minFromMidnight - CALENDAR_START_MIN) * PX_PER_MIN - 5 }}
            >
              {formatHour(minFromMidnight)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {CALENDAR_DAYS.map((day, dayIdx) => (
          <div
            key={day}
            className="relative flex-1 border-r border-gray-100 last:border-r-0"
            style={{ minHeight: totalHeight }}
          >
            {/* Hour and half-hour lines */}
            {hours.map((minFromMidnight) => (
              <React.Fragment key={minFromMidnight}>
                <div
                  className="absolute left-0 right-0 border-t border-gray-100"
                  style={{ top: (minFromMidnight - CALENDAR_START_MIN) * PX_PER_MIN }}
                />
                <div
                  className="absolute left-0 right-0 border-t border-gray-50"
                  style={{ top: (minFromMidnight + 30 - CALENDAR_START_MIN) * PX_PER_MIN }}
                />
              </React.Fragment>
            ))}

            {/* 6:30 AM unscheduled marker (Mon only) */}
            {dayIdx === 0 && (
              <div
                className="absolute left-0 right-0 border-t border-dashed border-gray-200"
                style={{ top: (UNSCHEDULED_MIN - CALENDAR_START_MIN) * PX_PER_MIN }}
              />
            )}

            {/* Course blocks */}
            {coursesByDay[dayIdx].map(({ course, topPx, heightPx, unscheduled, colIndex, colTotal }) => (
              <CalendarCourseBlock
                key={course.code}
                course={course}
                semesterId={semester.id}
                topPx={topPx}
                heightPx={heightPx}
                unscheduled={unscheduled}
                colIndex={colIndex}
                colTotal={colTotal}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SemesterColumn — a droppable semester slot
// ---------------------------------------------------------------------------

function SemesterColumn({
  semester,
  activeCourse,
  onRemoveSemester,
}: {
  semester: Semester;
  activeCourse: Course | null;
  onRemoveSemester: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: semester.id });
  const isPrereqSatisfied = usePlannerStore((s) => s.isPrereqSatisfied);

  const isInvalid =
    isOver && activeCourse !== null && !isPrereqSatisfied(semester.id, activeCourse);

  const totalCredits = semester.courses.reduce((sum, c) => sum + c.credits, 0);
  const isOverloaded = totalCredits > 18;

  return (
    // Outer wrapper keeps the "Remove Semester" button OUTSIDE the droppable
    // region so within(semester) queries don't find it.
    <div className="flex flex-col gap-1">
      {/* Header — semester name + credit count + remove button */}
      <div className="flex items-center justify-between px-0.5">
        <span className="text-sm font-semibold text-gray-700">{semester.label}</span>
        <div className="flex items-center gap-2">
          <span
            className={[
              "rounded-full px-2 py-0.5 text-xs font-medium",
              isOverloaded
                ? "bg-red-100 text-red-600"
                : "bg-gray-100 text-gray-500",
            ].join(" ")}
          >
            {totalCredits} / 18 cr
          </span>
          <button
            aria-label={`Remove semester ${semester.label}`}
            onClick={() => onRemoveSemester(semester.id)}
            className="text-sm text-gray-300 transition-colors hover:text-red-400"
            title="Remove semester"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Droppable zone — only course cards live inside this element */}
      <div
        ref={setNodeRef}
        role="region"
        aria-label={semester.label}
        data-testid={`semester-${semester.id}`}
        data-over={isOver ? "true" : undefined}
        data-invalid={isInvalid ? "true" : undefined}
        className={[
          "flex min-h-[160px] flex-col gap-2 rounded-2xl border-2 p-3 transition-all duration-150",
          isInvalid
            ? "border-red-300 bg-red-50"
            : isOver
            ? "border-green-400 bg-green-50 shadow-inner"
            : semester.courses.length === 0
            ? "border-dashed border-gray-200 bg-gray-50"
            : "border-gray-200 bg-white",
        ].join(" ")}
      >
        {semester.courses.map((course) => (
          <PlacedCourseCard
            key={course.code}
            course={course}
            semesterId={semester.id}
          />
        ))}

        {semester.courses.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1">
            {isInvalid ? (
              <p className="text-xs font-medium text-red-400">Prerequisite not met</p>
            ) : (
              <>
                <p className="text-2xl text-gray-200">↓</p>
                <p className="text-xs text-gray-300">Drop a course here</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CoursePlanner — root component
// ---------------------------------------------------------------------------

export function CoursePlanner({
  availableCourses,
  declaredMajor,
  declaredSecondMajor,
  declaredMinor,
}: {
  availableCourses: Course[];
  /** Student's declared major from their profile. "Undecided" or undefined means they must pick one. */
  declaredMajor?: string;
  /** Student's declared second major, if any. */
  declaredSecondMajor?: string;
  /** Student's declared minor from their profile, if any. */
  declaredMinor?: string;
}) {
  const {
    semesters,
    addCourse,
    addSemester,
    removeSemester,
    clearAllCourses,
    isPrereqSatisfied,
    isDuplicate,
    pendingChanges,
    clearPendingChanges,
    loadSchedule,
  } = usePlannerStore();

  // Load saved schedule from DB on mount
  const scheduleLoaded = useRef(false);
  useEffect(() => {
    if (scheduleLoaded.current || availableCourses.length === 0) return;
    scheduleLoaded.current = true;

    fetch("/api/schedule")
      .then((r) => r.ok ? r.json() : { items: [] })
      .then(({ items }) => {
        if (!items?.length) return;
        const courseMap = new Map(availableCourses.map((c) => [c.code, c]));
        const mapped = (items as Array<{ year: number; season: "FALL" | "SPRING"; completed: boolean; grade?: string | null; course: { code: string } }>)
          .map((item) => {
            const full = courseMap.get(item.course.code);
            if (!full) return null;
            return { year: item.year, season: item.season, completed: item.completed, grade: item.grade ?? null, course: full };
          })
          .filter(Boolean) as Array<{ year: number; season: "FALL" | "SPRING"; completed: boolean; grade?: string | null; course: typeof availableCourses[0] }>;
        loadSchedule(mapped);
      })
      .catch(() => {/* non-fatal */});
  }, [availableCourses, loadSchedule]);

  const [activeCourse, setActiveCourse]   = useState<Course | null>(null);
  const [notification, setNotification]   = useState<Notification | null>(null);
  const [saving, setSaving]               = useState(false);
  const [chatOpen, setChatOpen]           = useState(false);

  // ── Catalog search filters ────────────────────────────────────────────────
  const [searchTitle, setSearchTitle]   = useState("");
  const [searchCode,  setSearchCode]    = useState("");
  const [searchDept,  setSearchDept]    = useState("");
  const [searchLevel, setSearchLevel]   = useState("");
  const [searchColl,  setSearchColl]    = useState("");
  const [viewMode, setViewMode]           = useState<"calendar" | "grid">("grid");

  // Default to the first in-progress semester, first non-empty, or Year 1 Fall.
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>(() => {
    const sems = usePlannerStore.getState().semesters;
    const ip = sems.find((s) => s.courses.some((c) => c.status === "in-progress"));
    if (ip) return ip.id;
    const nonempty = sems.find((s) => s.courses.length > 0);
    return nonempty?.id ?? sems[0]?.id ?? "";
  });

  // ── Generate Schedule modal state ─────────────────────────────────────────
  const isUndeclared = !declaredMajor || declaredMajor === "Undecided";
  const [generateOpen, setGenerateOpen]       = useState(false);
  const [genSemesters, setGenSemesters]       = useState(8);
  const [genMaxCredits, setGenMaxCredits]     = useState(18);
  const [genAvoidEarly, setGenAvoidEarly]     = useState(false);
  const [genNoFriday, setGenNoFriday]         = useState(false);
  const [generating, setGenerating]           = useState(false);
  const [generateResult, setGenerateResult]   = useState<
    { type: "success"; message: string } | { type: "warning"; message: string } | { type: "error"; message: string } | null
  >(null);
  // Program selections
  const [genMajor, setGenMajor]               = useState(isUndeclared ? "" : (declaredMajor ?? ""));
  const [genSecondMajor, setGenSecondMajor]   = useState("");
  const [genMinor, setGenMinor]               = useState(declaredMinor ?? "");
  const [genConcentration, setGenConcentration] = useState("");
  // "major-only" → place only program requirements (no fill, no COLL)
  // "complete"   → program requirements + COLL gen-ed + fill all semesters
  const [genMode, setGenMode]                 = useState<"major-only" | "complete">("complete");

  // Sync declared major/minor/second major into modal state after Zustand store hydrates
  useEffect(() => {
    if (declaredMajor && declaredMajor !== "Undecided") {
      setGenMajor(declaredMajor);
    }
  }, [declaredMajor]);

  useEffect(() => {
    if (declaredSecondMajor) {
      setGenSecondMajor(declaredSecondMajor);
    }
  }, [declaredSecondMajor]);

  useEffect(() => {
    if (declaredMinor) {
      setGenMinor(declaredMinor);
    }
  }, [declaredMinor]);

  // Concentrations applicable to the currently selected major(s)
  const applicableConcentrations = CONCENTRATIONS.filter((c) => {
    if (!c.applicableMajors) return true;
    return (
      (genMajor      && c.applicableMajors.includes(genMajor))      ||
      (genSecondMajor && c.applicableMajors.includes(genSecondMajor))
    );
  });

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  // ── What-If store ─────────────────────────────────────────────────────────
  const whatIf = useWhatIfStore();

  // Ref so the generate effect always calls the latest version of handleGenerate
  // without needing it in its dependency array (avoids infinite loops).
  const handleGenerateRef = useRef<(overrides?: GenerateOverrides) => Promise<void>>();

  // Fire schedule generation exactly once each time the user clicks
  // "Generate Schedule" in the what-if modal.
  const lastGenerateTrigger = useRef(0);
  useEffect(() => {
    if (
      whatIf.active &&
      whatIf.mode === "generate" &&
      whatIf.generateTriggerCount > lastGenerateTrigger.current
    ) {
      lastGenerateTrigger.current = whatIf.generateTriggerCount;
      handleGenerateRef.current?.({
        major:         whatIf.major         ?? undefined,
        secondMajor:   whatIf.secondMajor   ?? undefined,
        minor:         whatIf.minor         ?? undefined,
        concentration: whatIf.concentration ?? undefined,
      });
    }
  }, [whatIf.active, whatIf.mode, whatIf.generateTriggerCount]);

  // Close generate modal on Escape key
  useEffect(() => {
    if (!generateOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setGenerateOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [generateOpen]);

  const placedCodes = new Set(semesters.flatMap((s) => s.courses.map((c) => c.code)));

  const overloadedSemesters = semesters.filter(
    (s) => s.courses.reduce((sum, c) => sum + c.credits, 0) > 18
  );

  const searchActive = !!(searchTitle || searchCode || searchDept || searchLevel || searchColl);

  const filteredCourses = searchActive
    ? availableCourses.filter((c) => {
        if (searchTitle && !c.title.toLowerCase().includes(searchTitle.toLowerCase())) return false;
        if (searchCode  && !c.code.toLowerCase().includes(searchCode.toLowerCase()))  return false;
        if (searchDept  && c.department !== searchDept)  return false;
        if (searchLevel) {
          const lvl = parseInt(searchLevel, 10);
          const m = c.code.match(/(\d{3})/);
          const cLvl = m ? Math.floor(parseInt(m[1], 10) / 100) * 100 : 0;
          if (cLvl !== lvl) return false;
        }
        if (searchColl  && c.collAttribute !== searchColl) return false;
        return true;
      })
    : [];

  // Group semesters by year; anything beyond year 4 goes in "Extra"
  const byYear = new Map<number, Semester[]>();
  for (const s of semesters) {
    if (!byYear.has(s.year)) byYear.set(s.year, []);
    byYear.get(s.year)!.push(s);
  }

  // Currently selected semester for calendar view
  const selectedSemester =
    semesters.find((s) => s.id === selectedSemesterId) ?? semesters[0];

  // ── Drag handlers ────────────────────────────────────────────────────────

  function resolveCourse(
    active: { id: string | number; data?: { current?: unknown } },
  ): Course | null {
    const id = String(active.id);
    // Pool card: id === course.code
    const fromPool = availableCourses.find((c) => c.code === id);
    if (fromPool) return fromPool;
    // Chat recommendation card: id === `chat-rec-${code}`
    // Extract the code from the id and look up the full course from the catalog.
    // This is more reliable than active.data?.current which can be stale after
    // the chat panel re-renders while dragging.
    if (id.startsWith("chat-rec-")) {
      const code = id.slice("chat-rec-".length);
      const fromCatalog = availableCourses.find((c) => c.code === code);
      if (fromCatalog) return fromCatalog;
      // Fallback: course not in catalog (e.g. AI hallucinated a code), use drag data
      if (active.data?.current) return active.data.current as Course;
    }
    return null;
  }

  function handleDragStart({ active }: { active: { id: string | number; data?: { current?: unknown } } }) {
    setActiveCourse(resolveCourse(active));
    setNotification(null);
  }

  function handleDragEnd({
    active,
    over,
  }: {
    active: { id: string | number; data?: { current?: unknown } };
    over: { id: string | number } | null;
  }) {
    setActiveCourse(null);
    if (!over) return;

    const semesterId = String(over.id);
    const course = resolveCourse(active);
    if (!course) return;
    const courseCode = course.code;

    if (!isPrereqSatisfied(semesterId, course)) {
      // Identify which prereqs are actually missing from earlier semesters.
      const { semesters: allSems } = usePlannerStore.getState();
      const semIdx = allSems.findIndex((s) => s.id === semesterId);
      const earlierCodes = new Set<string>();
      for (let i = 0; i < semIdx; i++) {
        allSems[i].courses.forEach((c) => earlierCodes.add(c.code));
      }
      const missing = course.prerequisiteCodes.filter((p) => !earlierCodes.has(p));
      setNotification({
        type: "error",
        message: `${course.code} requires ${missing.join(", ")} — place ${missing.length === 1 ? "it" : "them"} in an earlier semester first.`,
      });
      return;
    }

    const existingInSem = isDuplicate(course.code);
    addCourse(semesterId, course);

    if (existingInSem && existingInSem !== semesterId) {
      setNotification({
        type: "warning",
        message: `${course.code} is already placed in another semester.`,
      });
    }
  }

  // ── Generate Schedule ────────────────────────────────────────────────────

  async function handleGenerate(overrides?: GenerateOverrides) {
    const effectiveMajor       = overrides?.major         ?? genMajor;
    const effectiveSecondMajor = overrides?.secondMajor   ?? genSecondMajor;
    const effectiveMinor       = overrides?.minor         ?? genMinor;
    const effectiveConc        = overrides?.concentration ?? genConcentration;

    if (!effectiveMajor) {
      setGenerateResult({ type: "error", message: "Please select a major before generating." });
      return;
    }

    setGenerating(true);
    setGenerateResult(null);

    try {
    // Snapshot completed courses BEFORE clearing — we need to restore them
    // after generation so they stay in their original semesters, and pass them
    // to the generator so it knows not to re-place them.
    const preClearSemesters = usePlannerStore.getState().semesters;
    type SavedCompleted = { semId: string; course: PlannedCourse; year: number; season: "FALL" | "SPRING" };
    const savedCompleted: SavedCompleted[] = [];
    for (const sem of preClearSemesters) {
      for (const c of sem.courses) {
        if (c.status === "completed") {
          savedCompleted.push({ semId: sem.id, course: c, year: sem.year, season: sem.season });
        }
      }
    }

    // Clear all courses so the generated schedule starts fresh
    clearAllCourses();

    // Restore completed courses immediately — they must be present in the store
    // before the generated plan is applied so the slot-collision check skips them.
    for (const { semId, course } of savedCompleted) {
      addCourse(semId, course);
    }

    const isComplete = genMode === "complete";

    // Collect selected programs.
    // COLL_CURRICULUM is always included — W&M gen-ed requirements (ALV, CSI, NQR,
    // foreign language, proficiencies) are mandatory for every student regardless
    // of which schedule type is selected.
    const selectedPrograms: ProgramDefinition[] = [
      MAJORS.find((m) => m.name === effectiveMajor)!,
      ...(effectiveSecondMajor ? [MAJORS.find((m) => m.name === effectiveSecondMajor)!] : []),
      ...(effectiveMinor ? [MINORS.find((m) => m.name === effectiveMinor)!] : []),
      ...(effectiveConc ? [CONCENTRATIONS.find((c) => c.name === effectiveConc)!] : []),
      COLL_CURRICULUM,
    ].filter(Boolean);

    // Read fresh store state (after restoring completed courses).
    const freshSemesters = usePlannerStore.getState().semesters;
    // Exclude semesters that already contain completed courses — those are locked.
    const targetSemesters = freshSemesters
      .slice(0, genSemesters)
      .filter((s) => !s.courses.some((c) => c.status === "completed"));

    // Build the completed-courses list for the generator (code + credits + where they live).
    const completedCoursesForGen: GeneratorInput["completedCourses"] = savedCompleted.map(
      ({ course, year, season }) => ({
        code:    course.code,
        credits: course.credits,
        year,
        season,
      }),
    );

    // Completed course codes — exclude these from the unplaced catalog so
    // buildRequirementsFromPrograms doesn't try to re-add them as requirements.
    const completedCodeSet = new Set(completedCoursesForGen.map((c) => c.code));

    // Courses available for new placement (catalog minus already-completed).
    const unplacedCourses = availableCourses.filter((c) => !completedCodeSet.has(c.code));

    const { majorRequirements, electivePool, electiveCreditsNeeded, syntheticFallback } =
      buildRequirementsFromPrograms(selectedPrograms, unplacedCourses, completedCodeSet);

    // In "complete" mode, pass every remaining catalog course as a fill pool so
    // the generator brings all semesters up to the target credit load.
    const scheduledCodes = new Set([
      ...majorRequirements.map((r) => r.code),
      ...electivePool.map((r) => r.code),
    ]);
    const majorDepts     = getMajorDepartments(selectedPrograms);
    const allKnownDepts2 = getMajorDepartments([...MAJORS, ...MINORS, ...CONCENTRATIONS]);
    const fillPool: GeneratorInput["fillPool"] = isComplete
      ? shuffle(
          unplacedCourses.filter((c) => {
            if (scheduledCodes.has(c.code)) return false;
            // Fill pool is capped at 200-level — no elective filler above 200.
            if (extractCourseLevel(c.code) > 200) return false;
            if (c.majorRestriction) return majorDepts.has(c.majorRestriction);
            // majorDepts includes language/arts depts from COLL_CURRICULUM (always included),
            // so this correctly admits FREN, MUSC, THEA, etc. for fill slots.
            return allKnownDepts2.has(c.department ?? "") ||
                   majorDepts.has(c.department ?? "") ||
                   c.alv || c.csi || c.nqr || !!c.collAttribute;
          })
        ).map((c) => ({
            code:              c.code,
            credits:           c.credits,
            prerequisiteCodes: c.prerequisiteCodes,
            collAttribute:     c.collAttribute ?? null,
            seasons:           ["FALL", "SPRING"] as Season[],
          }))
      : undefined;

    // Build availableSections: map each course's known sections to every planned
    // semester whose season matches. Since scraped data is one term (e.g. Spring 2026),
    // we treat it as a proxy for future semesters of the same season.
    const availableSections: Record<string, import("@/lib/generator/types").SectionOption[]> = {};
    for (const course of availableCourses) {
      if (!course.sections.length) continue;
      const opts: import("@/lib/generator/types").SectionOption[] = [];
      for (const sec of course.sections) {
        if (!sec.crn || !sec.season) continue;
        const secSeason = sec.season as Season;
        for (const sem of targetSemesters) {
          if (sem.season !== secSeason) continue;
          opts.push({
            id:        `${sec.crn}-yr${sem.year}`,
            crn:       sec.crn,
            days:      sec.days || null,
            startTime: sec.startTime ?? null,
            endTime:   sec.endTime   ?? null,
            year:      sem.year,
            season:    secSeason,
          });
        }
      }
      if (opts.length) availableSections[course.code] = opts;
    }

    const input: GeneratorInput = {
      student:           { id: "local-student", catalogYear: new Date().getFullYear() },
      completedCourses:  completedCoursesForGen,
      majorRequirements,
      collRequirements:  [],
      electivePool,
      electiveCreditsNeeded,
      plannedSemesters:  targetSemesters.map((s) => ({ year: s.year, season: s.season as Season })),
      availableSections,
      preferences:       { avoidEarlyMorning: genAvoidEarly, noFridayClasses: genNoFriday, maxCreditsPerSemester: genMaxCredits },
      fillPool,
    };

      const res = await fetch("/api/schedule/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(input),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const msgs: string[] = data.errors?.map((e: { message: string }) => e.message) ?? [];
        setGenerateResult({
          type:    "error",
          message: msgs.length > 0 ? msgs.join("; ") : "Generation failed. Please try again.",
        });
        return;
      }

      // Load the generated plan into the planner
      const plan: GeneratedPlan = data.plan;

      // Primary lookup: courses from the catalog API
      const courseByCode = new Map(availableCourses.map((c) => [c.code, c]));

      // Fallback 1: static CourseRequirement data (codes that may not be in DB)
      for (const prog of selectedPrograms) {
        for (const req of prog.requirements) {
          if (req.type === "course" && !courseByCode.has(req.code)) {
            courseByCode.set(req.code, {
              code:              req.code,
              title:             req.title,
              credits:           req.credits,
              prerequisiteCodes: [],
              sections:          [],
              collAttribute:     null,
            });
          }
        }
      }

      // Fallback 2: synthetic placeholder courses created to cover credit shortfalls
      for (const [code, syn] of syntheticFallback) {
        if (!courseByCode.has(code)) courseByCode.set(code, syn);
      }

      // Snapshot semesters at placement time so the loop uses a consistent view
      const semestersSnapshot = usePlannerStore.getState().semesters;

      for (const genSem of plan.semesters) {
        // Find the matching semester slot by year + season
        const slot = semestersSnapshot.find(
          (s) => s.year === genSem.year && s.season === (genSem.season as string),
        );
        if (!slot) continue;

        const alreadyInSlot = new Set(slot.courses.map((c) => c.code));

        for (const placed of genSem.courses) {
          const full = courseByCode.get(placed.code);
          if (!full) continue;
          if (!alreadyInSlot.has(placed.code)) {
            addCourse(slot.id, full);
            alreadyInSlot.add(placed.code);
          }
        }
      }

      // Helper: minutes since midnight from "H:MM AM/PM" format
      function timeToMinutes(t: string | null | undefined): number | null {
        if (!t) return null;
        const upper = t.trim().toUpperCase();
        const isPm  = upper.endsWith("PM");
        const clean = upper.slice(0, -2).trim();
        const colon = clean.indexOf(":");
        if (colon < 0) return null;
        let h = parseInt(clean.slice(0, colon), 10);
        const m = parseInt(clean.slice(colon + 1), 10);
        if (isPm && h !== 12) h += 12;
        if (!isPm && h === 12) h = 0;
        return h * 60 + m;
      }
      const EARLY_CUTOFF = 9 * 60 + 30;

      // Check which placed courses could only be scheduled in a way that violates prefs.
      const fridayViolations: string[]      = [];
      const earlyViolations:  string[]      = [];

      for (const genSem of plan.semesters) {
        const semLabel = `Year ${genSem.year} ${genSem.season === "FALL" ? "Fall" : "Spring"}`;
        for (const placed of genSem.courses) {
          const course = availableCourses.find((c) => c.code === placed.code);
          if (!course || !course.sections.length) continue;
          const seasonSections = course.sections.filter((s) => s.season === genSem.season);
          if (seasonSections.length === 0) continue;

          if (genNoFriday) {
            const allFriday = seasonSections.every((s) => s.days && s.days.includes("F"));
            if (allFriday) fridayViolations.push(`${placed.code} (${semLabel})`);
          }
          if (genAvoidEarly) {
            const allEarly = seasonSections.every((s) => {
              const mins = timeToMinutes(s.startTime);
              return mins !== null && mins < EARLY_CUTOFF;
            });
            if (allEarly) earlyViolations.push(`${placed.code} (${semLabel})`);
          }
        }
      }

      const warnings: string[] = data.warnings ?? [];
      const prefWarnings: string[] = [];
      if (fridayViolations.length > 0)
        prefWarnings.push(`only Friday sections available: ${fridayViolations.join(", ")}`);
      if (earlyViolations.length > 0)
        prefWarnings.push(`only early-morning sections available: ${earlyViolations.join(", ")}`);

      if (prefWarnings.length > 0) {
        setGenerateResult({
          type: "warning",
          message: `Schedule generated. Scheduling preferences could not be fully honored — ${prefWarnings.join("; ")}.`,
        });
      } else if (warnings.length > 0) {
        setGenerateResult({
          type: "warning",
          message: `Schedule generated, but ${warnings.length} course${warnings.length !== 1 ? "s were" : " was"} placed out of prerequisite order. Review the plan and adjust manually if needed.`,
        });
      } else {
        setGenerateResult({ type: "success", message: "Schedule generated successfully!" });
      }
      setGenerateOpen(false);
    } catch {
      setGenerateResult({ type: "error", message: "Network error. Please try again." });
    } finally {
      setGenerating(false);
    }
  }

  // Keep the ref in sync so the what-if effect always calls the latest closure.
  handleGenerateRef.current = handleGenerate;

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setNotification(null);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: pendingChanges }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      clearPendingChanges();
      setNotification({ type: "success", message: "Schedule saved!" });
    } catch {
      setNotification({ type: "error", message: "Failed to save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-screen flex-col overflow-hidden bg-gray-50">

        {/* ── Top bar ────────────────────────────────────────────────────── */}
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
          <div className="flex items-center gap-6">
            {/* Logo */}
            <Link href="/planner" className="flex items-center gap-2.5 select-none">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" className="w-8 h-8 shrink-0">
                <path d="M32 6 C20 6 10 16 10 27 C10 39 32 58 32 58 C32 58 54 39 54 27 C54 16 44 6 32 6Z" fill="#1a5c38"/>
                <circle cx="32" cy="27" r="8" fill="white"/>
                <circle cx="10" cy="56" r="3" fill="#c8a951"/>
                <circle cx="21" cy="59" r="2" fill="#c8a951" fillOpacity="0.6"/>
                <circle cx="43" cy="59" r="2" fill="#c8a951" fillOpacity="0.6"/>
                <circle cx="54" cy="56" r="3" fill="#c8a951"/>
                <line x1="13" y1="56" x2="19" y2="59" stroke="#c8a951" strokeWidth="1.5" strokeDasharray="2,2"/>
                <line x1="23" y1="59" x2="41" y2="59" stroke="#c8a951" strokeWidth="1.5" strokeDasharray="2,2"/>
                <line x1="45" y1="59" x2="51" y2="56" stroke="#c8a951" strokeWidth="1.5" strokeDasharray="2,2"/>
              </svg>
              <div>
                <span className="text-lg font-bold leading-none" style={{ fontFamily: "Georgia, serif", color: "#1a5c38" }}>
                  Degree<span style={{ color: "#b8941e" }}>Map</span>
                </span>
                <p className="text-[10px] text-gray-400 leading-none mt-0.5">William &amp; Mary</p>
              </div>
            </Link>

            <nav className="flex items-center gap-1">
              <Link
                href="/planner"
                className="rounded-lg bg-green-50 px-4 py-2 text-sm font-medium text-green-800"
              >
                Planner
              </Link>
              <Link
                href="/courses"
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                Course Catalog
              </Link>
              <Link
                href="/student-info"
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                Student Info
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications inline in header */}
            {notification && notification.type !== "success" && (
              <div
                role="alert"
                data-testid="planner-notification"
                className={[
                  "max-w-sm rounded-lg px-3 py-1.5 text-xs",
                  notification.type === "error"
                    ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                    : "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
                ].join(" ")}
              >
                {notification.message}
              </div>
            )}
            {notification?.type === "success" && (
              <span className="text-xs text-green-600 font-medium">{notification.message}</span>
            )}

            {/* Generate Schedule button */}
            <button
              data-testid="generate-schedule-btn"
              onClick={() => { setGenerateOpen(true); setGenerateResult(null); }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2
                         text-sm font-medium text-gray-600 shadow-sm transition-colors
                         hover:border-green-300 hover:text-green-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2
                     M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Generate Schedule
            </button>

            {/* AI Advisor toggle */}
            <button
              onClick={() => setChatOpen((o) => !o)}
              aria-label={chatOpen ? "Close AI Advisor" : "Open AI Advisor"}
              className={[
                "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                chatOpen
                  ? "border-green-300 bg-green-50 text-green-800"
                  : "border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700",
              ].join(" ")}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4-1-4z" />
              </svg>
              AI Advisor
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              aria-label="Save Schedule"
              className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white shadow-sm
                         hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : "Save Schedule"}
            </button>
            {pendingChanges.length > 0 && !saving && (
              <span className="text-xs text-gray-400">
                {pendingChanges.length} unsaved
              </span>
            )}
            <LogoutButton />
          </div>
        </header>

        {/* ── Credit overload banner ──────────────────────────────────────── */}
        {overloadedSemesters.length > 0 && (
          <div
            role="status"
            className="shrink-0 border-b border-orange-200 bg-orange-50 px-6 py-2 text-xs text-orange-700"
          >
            ⚠ Credit limit exceeded in:{" "}
            <strong>{overloadedSemesters.map((s) => s.label).join(", ")}</strong>
            {" "}— max 18 credits per semester. You can still save after resolving conflicts.
          </div>
        )}

        {/* ── Main layout ────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left: Semester list ───────────────────────────────────────── */}
          <aside className="flex w-44 shrink-0 flex-col border-r border-gray-200 bg-white">
            <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Semesters
              </p>
            </div>

            {/* Semester buttons */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {semesters.map((sem) => {
                const semCredits = sem.courses.reduce((s, c) => s + c.credits, 0);
                const isSelected = sem.id === selectedSemesterId;
                const isOverloaded = semCredits > 18;
                const hasInProgress = sem.courses.some((c) => c.status === "in-progress");
                return (
                  <button
                    key={sem.id}
                    onClick={() => {
                      setSelectedSemesterId(sem.id);
                      if (viewMode === "grid") setViewMode("calendar");
                    }}
                    className={[
                      "w-full rounded-lg px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "bg-green-50 ring-1 ring-green-200"
                        : "hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <p className={`text-xs font-semibold leading-tight ${isSelected ? "text-green-800" : "text-gray-700"}`}>
                      {sem.label}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span
                        className={`text-[10px] tabular-nums ${
                          isOverloaded
                            ? "text-red-500 font-semibold"
                            : isSelected
                            ? "text-green-600"
                            : "text-gray-400"
                        }`}
                      >
                        {semCredits} cr
                      </span>
                      {hasInProgress && (
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" title="In progress" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom controls */}
            <div className="shrink-0 border-t border-gray-100 p-2 space-y-1.5">
              <button
                onClick={addSemester}
                className="w-full rounded-lg border border-gray-200 py-1.5 text-[11px]
                           font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                + Add Semester
              </button>
              <button
                onClick={() => setViewMode((v) => v === "grid" ? "calendar" : "grid")}
                className="w-full rounded-lg border border-gray-200 py-1.5 text-[11px]
                           font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                {viewMode === "grid" ? "Calendar View" : "Grid View"}
              </button>
            </div>
          </aside>

          {/* ── Middle: Calendar or Grid ──────────────────────────────────── */}
          {viewMode === "calendar" ? (
            selectedSemester ? (
              <WeeklyCalendar semester={selectedSemester} activeCourse={activeCourse} />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
                Select a semester on the left to view its calendar.
              </div>
            )
          ) : (
            <main className={["flex-1 overflow-y-auto px-6 py-5", chatOpen ? "min-w-0" : ""].join(" ")}>
              <div className="mb-4">
                <p className="text-xs text-gray-400">
                  Search for courses on the right, then drag them into a semester. Click a semester on the left for Calendar View.
                </p>
              </div>
              <div className="flex flex-col gap-8">
                {Array.from(byYear.entries())
                  .sort(([a], [b]) => a - b)
                  .map(([year, yearSemesters]) => (
                    <section key={year}>
                      <div className="mb-3 flex items-center gap-3">
                        <h2 className="text-sm font-bold text-gray-700">
                          {year <= 4 ? `Year ${year}` : `Additional — Year ${year}`}
                        </h2>
                        <div className="flex-1 border-t border-gray-200" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {yearSemesters.map((semester) => (
                          <SemesterColumn
                            key={semester.id}
                            semester={semester}
                            activeCourse={activeCourse}
                            onRemoveSemester={removeSemester}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
              </div>
            </main>
          )}

          {/* ── Chat sidebar (when open) ──────────────────────────────────── */}
          {chatOpen && (
            <aside className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
              <ChatPanel
                courseCatalog={availableCourses.map((c) => ({
                  code: c.code,
                  title: c.title,
                  credits: c.credits,
                }))}
                onAddCourse={(entry) => {
                  const full = availableCourses.find((c) => c.code === entry.code);
                  if (!full) return;
                  const targetId = selectedSemesterId ?? semesters[0]?.id;
                  if (!targetId) return;
                  if (!isPrereqSatisfied(targetId, full)) {
                    const { semesters: allSems } = usePlannerStore.getState();
                    const semIdx = allSems.findIndex((s) => s.id === targetId);
                    const earlierCodes = new Set<string>();
                    for (let i = 0; i < semIdx; i++) allSems[i].courses.forEach((c) => earlierCodes.add(c.code));
                    const missing = full.prerequisiteCodes.filter((p) => !earlierCodes.has(p));
                    setNotification({ type: "error", message: `${full.code} requires ${missing.join(", ")} — place ${missing.length === 1 ? "it" : "them"} in an earlier semester first.` });
                    return;
                  }
                  addCourse(targetId, full);
                  setNotification({ type: "success", message: `${full.code} added to ${semesters.find(s => s.id === targetId)?.label ?? "semester"}.` });
                }}
              />
            </aside>
          )}

          {/* ── Right: Search results (only when a filter is active) ──────── */}
          {searchActive && (
            <aside
              data-testid="course-pool"
              className="flex w-72 shrink-0 flex-col border-l border-gray-200 bg-white"
            >
              {/* Results header */}
              <div className="shrink-0 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{filteredCourses.length}</span>{" "}
                  result{filteredCourses.length !== 1 ? "s" : ""}
                </span>
                {viewMode === "calendar" && selectedSemester && (
                  <span className="text-[10px] text-gray-400">
                    Drop → <span className="font-medium text-green-700">{selectedSemester.label}</span>
                  </span>
                )}
              </div>

              {/* Scrollable course cards */}
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                {filteredCourses.length === 0 ? (
                  <p className="mt-8 text-center text-xs text-gray-300">No courses match your search.</p>
                ) : (
                  filteredCourses.map((course) => (
                    <DraggableCourseCard
                      key={course.code}
                      course={course}
                      isPlaced={placedCodes.has(course.code)}
                    />
                  ))
                )}
              </div>
            </aside>
          )}

          {/* ── Right: Course search filters (always visible) ─────────────── */}
          <aside className="flex w-60 shrink-0 flex-col border-l border-gray-200 bg-white overflow-y-auto">
            <div className="shrink-0 border-b border-gray-100 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Course Catalog
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Title / keyword */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  Title / Keyword
                </p>
                <input
                  type="text"
                  value={searchTitle}
                  onChange={(e) => setSearchTitle(e.target.value)}
                  placeholder="e.g. Algorithms"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm
                             text-gray-800 placeholder-gray-400 focus:border-green-600
                             focus:outline-none focus:ring-1 focus:ring-green-200"
                />
              </div>

              {/* Course code */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  Course Code
                </p>
                <input
                  type="text"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  placeholder="e.g. CSCI301"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm
                             text-gray-800 placeholder-gray-400 focus:border-green-600
                             focus:outline-none focus:ring-1 focus:ring-green-200"
                />
              </div>

              {/* Department */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  Department
                </p>
                <select
                  value={searchDept}
                  onChange={(e) => setSearchDept(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm
                             text-gray-800 focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-200"
                >
                  <option value="">All departments</option>
                  {["AMST","ANTH","ARTH","BIOL","CHEM","CHIN","CLCV","CSCI","DATA","ECON",
                    "EDUC","ENGL","FREN","GEOL","GERM","GOVT","HISP","HIST","ITAL","JAPN",
                    "KINE","LING","MATH","MUSC","PHIL","PHYS","PSYC","RELG","RUSS","SOCL",
                    "THEA","WGSS"].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Course level */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  Course Level
                </p>
                <select
                  value={searchLevel}
                  onChange={(e) => setSearchLevel(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm
                             text-gray-800 focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-200"
                >
                  <option value="">Any level</option>
                  {[100, 200, 300, 400].map((l) => (
                    <option key={l} value={String(l)}>{l}-level</option>
                  ))}
                </select>
              </div>

              {/* COLL attribute */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  COLL Attribute
                </p>
                <select
                  value={searchColl}
                  onChange={(e) => setSearchColl(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm
                             text-gray-800 focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-200"
                >
                  <option value="">Any</option>
                  {["COLL 100","COLL 150","COLL 200","COLL 300","COLL 350","COLL 400"].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              {/* Reset */}
              {searchActive && (
                <button
                  onClick={() => {
                    setSearchTitle(""); setSearchCode("");
                    setSearchDept(""); setSearchLevel(""); setSearchColl("");
                  }}
                  className="w-full rounded-lg border border-gray-200 py-2 text-xs font-medium
                             text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors"
                >
                  Reset filters
                </button>
              )}
            </div>
          </aside>
        </div>

        {/* ── Requirement tracker (expandable, below grid) ────────────────── */}
        <RequirementTracker declaredMajor={declaredMajor} declaredMinor={declaredMinor} />
      </div>

      {/* ── Generate Schedule modal ─────────────────────────────────────────── */}
      {generateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setGenerateOpen(false); }}
        >
          <div
            data-testid="generate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-modal-title"
            className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200"
          >
            {/* Header */}
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 id="generate-modal-title" className="text-base font-semibold text-gray-900">
                Generate Schedule
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Automatically fill your planner with courses from the catalog.
              </p>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">

              {/* ── Program selection ───────────────────────────────────── */}
              {/* Primary major */}
              <div>
                <label htmlFor="gen-major" className="mb-1 block text-xs font-medium text-gray-600">
                  Major <span className="text-red-500">*</span>
                </label>
                <select
                  id="gen-major"
                  data-testid="generate-major"
                  value={genMajor}
                  onChange={(e) => {
                    setGenMajor(e.target.value);
                    // Clear second major / concentration if they no longer apply
                    setGenSecondMajor("");
                    setGenConcentration("");
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm
                             focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
                >
                  <option value="">— Select a major —</option>
                  {MAJORS.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Second major (optional) */}
              <div>
                <label htmlFor="gen-second-major" className="mb-1 block text-xs font-medium text-gray-600">
                  Second Major <span className="text-gray-400">(optional)</span>
                </label>
                <select
                  id="gen-second-major"
                  data-testid="generate-second-major"
                  value={genSecondMajor}
                  onChange={(e) => { setGenSecondMajor(e.target.value); setGenConcentration(""); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm
                             focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
                >
                  <option value="">— None —</option>
                  {MAJORS.filter((m) => m.name !== genMajor).map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Minor (optional) */}
              <div>
                <label htmlFor="gen-minor" className="mb-1 block text-xs font-medium text-gray-600">
                  Minor <span className="text-gray-400">(optional)</span>
                </label>
                <select
                  id="gen-minor"
                  data-testid="generate-minor"
                  value={genMinor}
                  onChange={(e) => setGenMinor(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm
                             focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
                >
                  <option value="">— None —</option>
                  {MINORS.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Concentration (optional, filtered by selected majors) */}
              {applicableConcentrations.length > 0 && (
                <div>
                  <label htmlFor="gen-concentration" className="mb-1 block text-xs font-medium text-gray-600">
                    Concentration <span className="text-gray-400">(optional)</span>
                  </label>
                  <select
                    id="gen-concentration"
                    data-testid="generate-concentration"
                    value={genConcentration}
                    onChange={(e) => setGenConcentration(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm
                               focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
                  >
                    <option value="">— None —</option>
                    {applicableConcentrations.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── Scheduling options ──────────────────────────────────── */}
              {/* Number of semesters */}
              <div>
                <label htmlFor="gen-semesters" className="mb-1 block text-xs font-medium text-gray-600">
                  Number of semesters to fill
                </label>
                <input
                  id="gen-semesters"
                  data-testid="generate-semesters"
                  type="number"
                  min={1}
                  max={8}
                  value={genSemesters}
                  onChange={(e) => setGenSemesters(Math.max(1, Math.min(8, Number(e.target.value))))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm
                             focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
                />
              </div>

              {/* Max credits per semester */}
              <div>
                <label htmlFor="gen-max-credits" className="mb-1 block text-xs font-medium text-gray-600">
                  Max credits per semester
                </label>
                <input
                  id="gen-max-credits"
                  data-testid="generate-max-credits"
                  type="number"
                  min={9}
                  max={22}
                  value={genMaxCredits}
                  onChange={(e) => setGenMaxCredits(Math.max(9, Math.min(22, Number(e.target.value))))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm
                             focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
                />
              </div>

              {/* ── Schedule type ────────────────────────────────────────── */}
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-gray-600">
                  Schedule type <span className="text-red-500">*</span>
                </legend>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-2.5 transition-colors hover:bg-gray-50">
                    <input
                      type="radio"
                      name="genMode"
                      value="major-only"
                      checked={genMode === "major-only"}
                      onChange={() => setGenMode("major-only")}
                      className="mt-0.5 text-green-600 focus:ring-green-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Requirements only</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Place all required courses — major, gen-ed (ALV, CSI, NQR), foreign language, and COLL proficiencies. No free elective filler.
                      </p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-2.5 transition-colors hover:bg-gray-50">
                    <input
                      type="radio"
                      name="genMode"
                      value="complete"
                      checked={genMode === "complete"}
                      onChange={() => setGenMode("complete")}
                      className="mt-0.5 text-green-600 focus:ring-green-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Complete 4-year plan</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        All requirements + free electives to bring every semester up to the credit target.
                      </p>
                    </div>
                  </label>
                </div>
              </fieldset>

              {/* Scheduling preferences */}
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-gray-600">Scheduling preferences</legend>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={genAvoidEarly}
                      onChange={(e) => setGenAvoidEarly(e.target.checked)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    Avoid early-morning sections (before 9:30 am)
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={genNoFriday}
                      onChange={(e) => setGenNoFriday(e.target.checked)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    No Friday classes
                  </label>
                </div>
              </fieldset>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setGenerateOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium
                           text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                data-testid="generate-submit"
                onClick={() => handleGenerate()}
                disabled={generating}
                className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white
                           shadow-sm hover:bg-green-700 disabled:cursor-not-allowed
                           disabled:opacity-60 transition-colors"
              >
                {generating ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate result banners (rendered outside the modal so they persist after close) */}
      {generateResult?.type === "warning" && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-amber-500
                     px-5 py-3 text-sm font-medium text-white shadow-lg"
        >
          {generateResult.message}
          <button
            onClick={() => setGenerateResult(null)}
            className="ml-3 text-amber-200 hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {generateResult?.type === "success" && (
        <div
          data-testid="generate-success"
          role="status"
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-green-800
                     px-5 py-3 text-sm font-medium text-white shadow-lg"
        >
          {generateResult.message}
          <button
            onClick={() => setGenerateResult(null)}
            className="ml-3 text-green-300 hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {generateResult?.type === "error" && (
        <div
          data-testid="generate-error"
          role="alert"
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-red-600
                     px-5 py-3 text-sm font-medium text-white shadow-lg"
        >
          {generateResult.message}
          <button
            onClick={() => setGenerateResult(null)}
            className="ml-3 text-red-300 hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Drag overlay — ghost card that follows the cursor */}
      <DragOverlay>
        {activeCourse && (
          <div className="w-64 cursor-grabbing rounded-xl border border-green-400 bg-white px-3 py-2.5 shadow-2xl opacity-95">
            <p className="text-sm font-semibold text-gray-800">{activeCourse.title}</p>
            <p className="text-xs text-gray-400">{activeCourse.code} &middot; {activeCourse.credits} cr</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
