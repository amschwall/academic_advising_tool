// file: components/RequirementTracker.tsx
"use client";

import React, { useState } from "react";
import { usePlannerStore, type PlannedCourse } from "@/lib/stores/plannerStore";
import { useWhatIfStore } from "@/lib/stores/whatIfStore";
import { WhatIfModal } from "@/components/WhatIfModal";
import {
  MAJORS, MINORS,
  type ProgramDefinition,
  type CourseRequirement,
  type CreditRequirement,
  type MajorRequirementItem,
} from "@/lib/data/majors";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  /** Courses with ScheduleItem.completed === true (already taken and graded). */
  completedCourses?: PlannedCourse[];
  /** AP / transfer / equivalency credits — count as completed. */
  transferCourses?: PlannedCourse[];
  /** Student's declared major from Supabase user_metadata. Defaults to "Undecided". */
  declaredMajor?: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RequirementStatus = "missing" | "planned" | "completed";

interface CollReqDef {
  id: string;
  label: string;
  sublabel?: string;
  matches: (course: PlannedCourse) => boolean;
}

// ---------------------------------------------------------------------------
// COLL / gen-ed / proficiency requirement definitions (unchanged from Phase 15)
// ---------------------------------------------------------------------------

const COLL_REQUIREMENTS: CollReqDef[] = [
  { id: "req-coll-100", label: "COLL 100", sublabel: "First-year experience",
    matches: (c) => c.collAttribute === "COLL 100" },
  { id: "req-coll-150", label: "COLL 150", sublabel: "Writing intensive",
    matches: (c) => c.collAttribute === "COLL 150" },
  { id: "req-coll-200-nqr", label: "COLL 200 – NQR", sublabel: "Natural, Quantitative & Reasoning",
    matches: (c) => c.collAttribute === "COLL 200" && !!c.nqr },
  { id: "req-coll-200-csi", label: "COLL 200 – CSI", sublabel: "Culture, Society & Identity",
    matches: (c) => c.collAttribute === "COLL 200" && !!c.csi },
  { id: "req-coll-200-alv", label: "COLL 200 – ALV", sublabel: "Arts, Literature & Values",
    matches: (c) => c.collAttribute === "COLL 200" && !!c.alv },
  { id: "req-coll-300", label: "COLL 300", sublabel: "Writing in the major",
    matches: (c) => c.collAttribute === "COLL 300" },
  { id: "req-coll-350", label: "COLL 350", sublabel: "Experiential learning",
    matches: (c) => c.collAttribute === "COLL 350" },
  { id: "req-coll-500", label: "COLL 500", sublabel: "Capstone",
    matches: (c) => c.collAttribute === "COLL 500" },
  { id: "req-nqr", label: "Gen-Ed NQR (non-200)", sublabel: "Natural, Quantitative & Reasoning",
    matches: (c) => !!c.nqr && c.collAttribute !== "COLL 200" },
  { id: "req-csi", label: "Gen-Ed CSI (non-200)", sublabel: "Culture, Society & Identity",
    matches: (c) => !!c.csi && c.collAttribute !== "COLL 200" },
  { id: "req-alv", label: "Gen-Ed ALV (non-200)", sublabel: "Arts, Literature & Values",
    matches: (c) => !!c.alv && c.collAttribute !== "COLL 200" },
  { id: "req-lang-prof", label: "Language Proficiency",
    matches: (c) => !!c.langProf },
  { id: "req-arts-prof", label: "Arts Proficiency",
    matches: (c) => !!c.artsProf },
];

const CREDIT_GOAL = 120;

// ---------------------------------------------------------------------------
// Helpers — COLL status
// ---------------------------------------------------------------------------

function computeCollStatus(
  req: CollReqDef,
  plannedCourses: PlannedCourse[],
  completedCourses: PlannedCourse[],
  transferCourses: PlannedCourse[],
): RequirementStatus {
  const allCompleted = [...completedCourses, ...transferCourses];
  if (allCompleted.some(req.matches)) return "completed";
  if (plannedCourses.some(req.matches)) return "planned";
  return "missing";
}

// ---------------------------------------------------------------------------
// Helpers — major / minor credit requirement matching
// ---------------------------------------------------------------------------

/**
 * Extract the W&M course level (100 / 200 / 300 / 400 / 500) from a course code.
 * e.g. "CSCI303" → 300, "MATH112" → 100, "BIOL204" → 200.
 */
function getCourseLevel(code: string): number {
  const match = code.match(/\d+/);
  if (!match) return 0;
  return Math.floor(parseInt(match[0], 10) / 100) * 100;
}

/**
 * Return the department for a course: use the explicit `department` field if
 * present, otherwise infer from the leading alpha characters of the code.
 */
function getCourseDept(course: PlannedCourse): string {
  if (course.department) return course.department;
  const match = course.code.match(/^[A-Z]+/);
  return match ? match[0] : "";
}

/** True if a course satisfies the department / minLevel filters of a credit requirement. */
function qualifiesForCreditReq(
  course: PlannedCourse,
  req: CreditRequirement,
): boolean {
  if (req.departments && req.departments.length > 0) {
    const dept = getCourseDept(course);
    if (!req.departments.includes(dept)) return false;
  }
  if (req.minLevel !== undefined) {
    if (getCourseLevel(course.code) < req.minLevel) return false;
  }
  return true;
}

interface CreditReqResult {
  status: RequirementStatus;
  earned: number;
}

/**
 * Compute status and earned credits for a credit-type major/minor requirement.
 * De-duplicates by course code; completed/transfer take priority.
 */
function computeCreditReqStatus(
  req: CreditRequirement,
  plannedCourses: PlannedCourse[],
  completedAndTransfer: PlannedCourse[],
): CreditReqResult {
  const seen = new Set<string>();
  let completedEarned = 0;
  let totalEarned = 0;

  for (const c of completedAndTransfer) {
    if (!seen.has(c.code) && qualifiesForCreditReq(c, req)) {
      seen.add(c.code);
      completedEarned += c.credits;
      totalEarned += c.credits;
    } else if (!seen.has(c.code)) {
      seen.add(c.code); // mark seen even if doesn't qualify
    }
  }

  for (const c of plannedCourses) {
    if (!seen.has(c.code) && qualifiesForCreditReq(c, req)) {
      seen.add(c.code);
      totalEarned += c.credits;
    } else if (!seen.has(c.code)) {
      seen.add(c.code);
    }
  }

  const status: RequirementStatus =
    totalEarned >= req.credits
      ? completedEarned >= req.credits
        ? "completed"
        : "planned"
      : "missing";

  return { status, earned: totalEarned };
}

// ---------------------------------------------------------------------------
// Helpers — total credit computation (de-duped across all sources)
// ---------------------------------------------------------------------------

function computeTotalCredits(
  plannedCourses: PlannedCourse[],
  completedCourses: PlannedCourse[],
  transferCourses: PlannedCourse[],
): { total: number; completedTotal: number } {
  const seen = new Set<string>();
  let total = 0;
  let completedTotal = 0;

  for (const c of [...completedCourses, ...transferCourses]) {
    if (!seen.has(c.code)) {
      seen.add(c.code);
      total += c.credits;
      completedTotal += c.credits;
    }
  }
  for (const c of plannedCourses) {
    if (!seen.has(c.code)) {
      seen.add(c.code);
      total += c.credits;
    }
  }
  return { total, completedTotal };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: RequirementStatus }) {
  const styles: Record<RequirementStatus, string> = {
    completed: "bg-green-100 text-green-800 ring-1 ring-green-200",
    planned:   "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200",
    missing:   "bg-red-50 text-red-700 ring-1 ring-red-200",
  };
  const labels: Record<RequirementStatus, string> = {
    completed: "Complete",
    planned:   "Planned",
    missing:   "Missing",
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function CollRow({ req, status }: { req: CollReqDef; status: RequirementStatus }) {
  const borderColors: Record<RequirementStatus, string> = {
    completed: "border-green-100",
    planned:   "border-yellow-100",
    missing:   "border-red-100",
  };
  return (
    <li
      role="listitem"
      data-testid={req.id}
      data-status={status}
      className={`flex items-center justify-between gap-3 border-b px-5 py-3 last:border-b-0 ${borderColors[status]}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800">{req.label}</p>
        {req.sublabel && <p className="text-xs text-gray-400">{req.sublabel}</p>}
      </div>
      <StatusBadge status={status} />
    </li>
  );
}

/** Renders one major or minor program's requirements as a labelled section. */
function ProgramSection({
  program,
  plannedCourses,
  completedCourses,
  transferCourses,
  sectionTestId,
  courseTestIdPrefix,
  creditTestIdPrefix,
}: {
  program: ProgramDefinition;
  plannedCourses: PlannedCourse[];
  completedCourses: PlannedCourse[];
  transferCourses: PlannedCourse[];
  sectionTestId: string;
  courseTestIdPrefix: string;
  creditTestIdPrefix: string;
}) {
  if (program.requirements.length === 0) return null;

  const allCompleted = [...completedCourses, ...transferCourses];
  let creditIndex = 0;

  const borderColors: Record<RequirementStatus, string> = {
    completed: "border-green-100",
    planned:   "border-yellow-100",
    missing:   "border-red-100",
  };

  return (
    <div data-testid={sectionTestId} className="border-t border-gray-100">
      {/* Section heading */}
      <div className="flex items-center gap-3 bg-gray-50 px-5 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {program.name}
        </span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {/* Requirement rows */}
      {program.requirements.map((req: MajorRequirementItem) => {
        if (req.type === "course") {
          const courseReq = req as CourseRequirement;
          // Status: completed wins over planned wins over missing
          const isCompleted = allCompleted.some((c) => c.code === courseReq.code);
          const isPlanned   = plannedCourses.some((c) => c.code === courseReq.code);
          const status: RequirementStatus = isCompleted
            ? "completed"
            : isPlanned
            ? "planned"
            : "missing";

          return (
            <div
              key={courseReq.code}
              data-testid={`${courseTestIdPrefix}${courseReq.code}`}
              data-status={status}
              className={`flex items-center justify-between gap-3 border-b px-5 py-3 last:border-b-0 ${borderColors[status]}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">{courseReq.code}</p>
                <p className="text-xs text-gray-400">{courseReq.title}</p>
              </div>
              <StatusBadge status={status} />
            </div>
          );
        }

        // Credit requirement
        const creditReq = req as CreditRequirement;
        const idx = creditIndex++;
        const { status, earned } = computeCreditReqStatus(
          creditReq,
          plannedCourses,
          allCompleted,
        );

        return (
          <div
            key={`${creditTestIdPrefix}${idx}`}
            data-testid={`${creditTestIdPrefix}${idx}`}
            data-status={status}
            className={`border-b px-5 py-3 last:border-b-0 ${borderColors[status]}`}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-800">{creditReq.description}</p>
              <StatusBadge status={status} />
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={[
                  "h-full rounded-full transition-all duration-300",
                  status === "completed" ? "bg-green-500"
                    : status === "planned" ? "bg-yellow-400"
                    : "bg-gray-300",
                ].join(" ")}
                style={{ width: `${Math.min((earned / creditReq.credits) * 100, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-gray-500">
              <span>{earned} / {creditReq.credits}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RequirementTracker({
  completedCourses = [],
  transferCourses  = [],
  declaredMajor    = "Undecided",
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab]   = useState<"requirements" | "programs">("requirements");

  const semesters     = usePlannerStore((s) => s.semesters);
  const plannedCourses = semesters.flatMap((s) => s.courses);

  const whatIf = useWhatIfStore();

  // Auto-switch to Programs tab when a what-if analysis becomes active.
  // Does NOT auto-open the panel — user still controls that toggle.
  React.useEffect(() => {
    if (whatIf.active) setTab("programs");
  }, [whatIf.active]);

  // ── Credit totals ──────────────────────────────────────────────────────────
  const { total: totalCredits, completedTotal: completedCredits } =
    computeTotalCredits(plannedCourses, completedCourses, transferCourses);

  const creditStatus: RequirementStatus =
    totalCredits >= CREDIT_GOAL
      ? completedCredits >= CREDIT_GOAL
        ? "completed"
        : "planned"
      : "missing";

  // ── Which major programs to display ────────────────────────────────────────
  // Use a Set to avoid duplicates (e.g. declared = CS, what-if = CS).
  const majorNames = new Set<string>();
  if (declaredMajor !== "Undecided") majorNames.add(declaredMajor);
  if (whatIf.active && whatIf.major)  majorNames.add(whatIf.major);

  const majorPrograms = Array.from(majorNames)
    .map((name) => MAJORS.find((m) => m.name === name))
    .filter((p): p is ProgramDefinition => p !== undefined && p.requirements.length > 0);

  // ── Which minor program to display ─────────────────────────────────────────
  const minorProgram =
    whatIf.active && whatIf.minor
      ? MINORS.find((m) => m.name === whatIf.minor && m.requirements.length > 0) ?? null
      : null;

  const creditBorderColor: Record<RequirementStatus, string> = {
    completed: "border-green-100",
    planned:   "border-yellow-100",
    missing:   "border-red-100",
  };

  return (
    <div className="border-t border-gray-200 bg-white">

      {/* ── Header row: toggle + What-If button ─────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
        >
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {open ? "Hide Requirements" : "View Requirements"}
        </button>

        <button
          onClick={() => useWhatIfStore.getState().openModal()}
          className={[
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            whatIf.active
              ? "border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100"
              : "border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-700",
          ].join(" ")}
        >
          What-If Analysis
        </button>
      </div>

      {/* WhatIfModal (renders itself based on store.open) */}
      <WhatIfModal declaredMajor={declaredMajor} />

      {/* ── Expanded panel ────────────────────────────────────────────────── */}
      {open && (
        <div className="flex flex-col" style={{ maxHeight: "55vh" }}>

          {/* What-if active banner — always visible inside panel */}
          {whatIf.active && (
            <div
              data-testid="what-if-banner"
              className="flex shrink-0 items-center justify-between border-b border-yellow-100
                         bg-yellow-50 px-5 py-3"
            >
              <div className="flex flex-wrap items-center gap-1 text-sm text-yellow-800">
                <span className="font-semibold">What-If:</span>
                {whatIf.major && <span>{whatIf.major}</span>}
                {whatIf.minor && (
                  <>
                    <span className="text-yellow-500">+</span>
                    <span>{whatIf.minor} minor</span>
                  </>
                )}
                {whatIf.concentration && (
                  <>
                    <span className="text-yellow-500">+</span>
                    <span>{whatIf.concentration} concentration</span>
                  </>
                )}
              </div>
              <button
                onClick={() => useWhatIfStore.getState().deactivate()}
                className="ml-4 shrink-0 rounded-lg border border-yellow-200 px-3 py-1
                           text-xs font-medium text-yellow-700 hover:bg-yellow-100 transition-colors"
              >
                Clear
              </button>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex shrink-0 border-b border-gray-100 bg-gray-50">
            <button
              onClick={() => setTab("requirements")}
              className={[
                "flex-1 px-4 py-2 text-xs font-medium transition-colors",
                tab === "requirements"
                  ? "border-b-2 border-green-600 text-green-700"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              Degree Requirements
            </button>
            <button
              onClick={() => setTab("programs")}
              className={[
                "flex-1 px-4 py-2 text-xs font-medium transition-colors",
                tab === "programs"
                  ? "border-b-2 border-green-600 text-green-700"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              Major / Minor
              {(majorPrograms.length > 0 || minorProgram) && (
                <span className={[
                  "ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  tab === "programs" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500",
                ].join(" ")}>
                  {majorPrograms.length + (minorProgram ? 1 : 0)}
                </span>
              )}
            </button>
          </div>

          {/* Scrollable content area — both tabs always in DOM for test accessibility */}
          <div className="overflow-y-auto flex-1">

            {/* ── Tab: Degree Requirements ─────────────────────────────────── */}
            <div className={tab !== "requirements" ? "hidden" : undefined}>
              <ul
                role="list"
                aria-label="Degree Requirements"
                className="divide-y divide-gray-50"
              >
                {COLL_REQUIREMENTS.map((req) => (
                  <CollRow
                    key={req.id}
                    req={req}
                    status={computeCollStatus(req, plannedCourses, completedCourses, transferCourses)}
                  />
                ))}

                {/* Total credits row */}
                <li
                  role="listitem"
                  data-testid="req-credits"
                  data-status={creditStatus}
                  className={`border-b px-5 py-3 last:border-b-0 ${creditBorderColor[creditStatus]}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800">Total Credits</p>
                    <StatusBadge status={creditStatus} />
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Credit progress"
                    aria-valuenow={totalCredits}
                    aria-valuemin={0}
                    aria-valuemax={CREDIT_GOAL}
                    className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
                  >
                    <div
                      className={[
                        "h-full rounded-full transition-all duration-300",
                        creditStatus === "completed" ? "bg-green-500"
                          : creditStatus === "planned" ? "bg-yellow-400"
                          : "bg-gray-300",
                      ].join(" ")}
                      style={{ width: `${Math.min((totalCredits / CREDIT_GOAL) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs text-gray-500">
                    <span>{totalCredits} / {CREDIT_GOAL}</span>
                  </p>
                </li>
              </ul>
            </div>

            {/* ── Tab: Major / Minor ───────────────────────────────────────── */}
            <div className={tab !== "programs" ? "hidden" : undefined}>
              {majorPrograms.length === 0 && !minorProgram && (
                <p className="px-5 py-8 text-center text-sm text-gray-400">
                  No major or minor selected.{" "}
                  <button
                    onClick={() => useWhatIfStore.getState().openModal()}
                    className="font-medium text-green-700 underline hover:text-green-800"
                  >
                    Run What-If Analysis
                  </button>{" "}
                  to explore a program.
                </p>
              )}

              {/* Major requirements section(s) */}
              {majorPrograms.map((program) => (
                <ProgramSection
                  key={program.name}
                  program={program}
                  plannedCourses={plannedCourses}
                  completedCourses={completedCourses}
                  transferCourses={transferCourses}
                  sectionTestId="major-requirements-section"
                  courseTestIdPrefix="req-major-course-"
                  creditTestIdPrefix="req-major-credits-"
                />
              ))}

              {/* Minor requirements section */}
              {minorProgram && (
                <ProgramSection
                  program={minorProgram}
                  plannedCourses={plannedCourses}
                  completedCourses={completedCourses}
                  transferCourses={transferCourses}
                  sectionTestId="minor-requirements-section"
                  courseTestIdPrefix="req-minor-course-"
                  creditTestIdPrefix="req-minor-credits-"
                />
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
