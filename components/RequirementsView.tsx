// file: components/RequirementsView.tsx
"use client";

import React, { useState, useMemo } from "react";
import {
  MAJORS,
  COLL_CURRICULUM,
  MajorRequirementItem,
  CourseRequirement,
  CreditRequirement,
  AttributeRequirement,
  ProgramDefinition,
} from "@/lib/data/majors";
import { usePlannerStore, PlannedCourse, CourseStatus } from "@/lib/stores/plannerStore";
import { useStudentStore } from "@/lib/stores/studentStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCourseLevel(code: string): number {
  const m = code.match(/(\d{3})/);
  return m ? Math.floor(parseInt(m[1], 10) / 100) * 100 : 0;
}

function getDept(course: PlannedCourse): string {
  if (course.department) return course.department;
  const m = course.code.match(/^([A-Z]+)/);
  return m ? m[1] : "";
}

// ---------------------------------------------------------------------------
// Matching logic per requirement type
// ---------------------------------------------------------------------------

interface CreditResult {
  done: number;
  needed: number;
  matching: PlannedCourse[];
}

interface AttrResult {
  done: number;
  needed: number;
  matching: PlannedCourse[];
}

function matchCreditReq(req: CreditRequirement, planned: PlannedCourse[]): CreditResult {
  let matching: PlannedCourse[];

  if (req.electiveCourses?.length) {
    // Approved elective list — match by code
    const approvedCodes = new Set(req.electiveCourses.map((e) => e.code));
    matching = planned.filter((c) => approvedCodes.has(c.code));
  } else if (req.departments?.length) {
    // Department (+ optional level) filter
    matching = planned.filter((c) => {
      if (!req.departments!.includes(getDept(c))) return false;
      if (req.minLevel && getCourseLevel(c.code) < req.minLevel) return false;
      return true;
    });
  } else if (req.minLevel) {
    // Level-only filter (e.g. COLL 300 / COLL 400 — any upper-div course)
    matching = planned.filter((c) => getCourseLevel(c.code) >= req.minLevel!);
  } else {
    // No filter at all → treat as COLL 100/150 first-year seminar:
    // count courses that carry a COLL 100 or COLL 150 attribute
    matching = planned.filter(
      (c) => c.collAttribute === "COLL 100" || c.collAttribute === "COLL 150",
    );
  }

  const done = matching.reduce((s, c) => s + c.credits, 0);
  return { done, needed: req.credits, matching };
}

function matchAttrReq(req: AttributeRequirement, planned: PlannedCourse[]): AttrResult {
  const key = req.attribute as keyof PlannedCourse;
  const matching = planned.filter((c) => c[key] === true);
  return { done: matching.length, needed: req.count, matching };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<CourseStatus, string> = {
  "planned":     "bg-blue-100 text-blue-700",
  "in-progress": "bg-yellow-100 text-yellow-700",
  "completed":   "bg-green-100 text-green-700",
};

const STATUS_LABEL: Record<CourseStatus, string> = {
  "planned":     "Planned",
  "in-progress": "In Progress",
  "completed":   "Completed",
};

const STATUS_DOT: Record<CourseStatus, string> = {
  "planned":     "bg-blue-400",
  "in-progress": "bg-yellow-400",
  "completed":   "bg-green-500",
};

function getStatus(course: PlannedCourse): CourseStatus {
  return course.status ?? "planned";
}

// ---------------------------------------------------------------------------
// UI primitives
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: CourseStatus | null }) {
  if (!status) {
    // not in planner
    return <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-200" />;
  }
  if (status === "completed") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (status === "in-progress") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-yellow-100">
        <span className="h-2 w-2 rounded-full bg-yellow-400" />
      </span>
    );
  }
  // planned
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100">
      <span className="h-2 w-2 rounded-full bg-blue-400" />
    </span>
  );
}

/** Segmented progress bar split by status */
function ProgressBar({
  matching,
  needed,
  unit,
}: {
  matching: PlannedCourse[];
  needed: number;
  unit: "credits" | "count";
}) {
  const getValue = (c: PlannedCourse) => unit === "credits" ? c.credits : 1;
  const completedVal  = matching.filter((c) => getStatus(c) === "completed").reduce((s, c) => s + getValue(c), 0);
  const inProgressVal = matching.filter((c) => getStatus(c) === "in-progress").reduce((s, c) => s + getValue(c), 0);
  const plannedVal    = matching.filter((c) => getStatus(c) === "planned").reduce((s, c) => s + getValue(c), 0);
  const done = completedVal + inProgressVal + plannedVal;

  const pct = (v: number) => needed > 0 ? Math.min(100, (v / needed) * 100) : 0;
  const completedPct  = pct(completedVal);
  const inProgressPct = pct(inProgressVal);
  const plannedPct    = pct(plannedVal);

  const badgeCls = completedVal >= needed
    ? "text-green-600"
    : inProgressVal + completedVal >= needed
    ? "text-yellow-600"
    : plannedVal + inProgressVal + completedVal >= needed
    ? "text-blue-600"
    : "text-gray-500";

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden flex">
        <div className="h-full bg-green-500 transition-all"  style={{ width: `${completedPct}%` }} />
        <div className="h-full bg-yellow-400 transition-all" style={{ width: `${inProgressPct}%` }} />
        <div className="h-full bg-blue-400 transition-all"   style={{ width: `${plannedPct}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${badgeCls}`}>
        {done}/{needed}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requirement row components
// ---------------------------------------------------------------------------

function CourseReqRow({ req, planned }: { req: CourseRequirement; planned: PlannedCourse[] }) {
  const match  = planned.find((c) => c.code === req.code) ?? null;
  const status = match ? getStatus(match) : null;

  return (
    <li className="flex items-start gap-3 py-2.5">
      <StatusIcon status={status} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-xs font-bold text-green-800">{req.code}</span>
          <span className="text-sm text-gray-700">{req.title}</span>
          <span className="text-xs text-gray-400">{req.credits} cr</span>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
          status ? STATUS_BADGE[status] : "bg-gray-100 text-gray-500"
        }`}
      >
        {status ? STATUS_LABEL[status] : "Not planned"}
      </span>
    </li>
  );
}

function CreditReqRow({ req, planned }: { req: CreditRequirement; planned: PlannedCourse[] }) {
  const { done, needed, matching } = matchCreditReq(req, planned);
  const [open, setOpen] = useState(false);

  // Badge reflects best status present in matching courses
  const hasCompleted   = matching.some((c) => getStatus(c) === "completed");
  const hasInProgress  = matching.some((c) => getStatus(c) === "in-progress");
  const met = done >= needed;
  const badgeCls = met && hasCompleted  ? "bg-green-100 text-green-700"
    : met && hasInProgress              ? "bg-yellow-100 text-yellow-700"
    : met                               ? "bg-blue-100 text-blue-700"
    : "bg-gray-100 text-gray-500";

  const plannedCodes = new Set(planned.map((c) => c.code));

  return (
    <li className="py-2.5">
      <div className="flex items-start gap-3">
        <StatusIcon status={met ? (hasCompleted ? "completed" : hasInProgress ? "in-progress" : "planned") : null} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-700">{req.description}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badgeCls}`}>
              {done}/{needed} cr
            </span>
          </div>
          <ProgressBar matching={matching} needed={needed} unit="credits" />

          {/* Matched courses (collapsible) */}
          {matching.length > 0 && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="mt-1.5 text-xs text-gray-400 hover:underline"
            >
              {open ? "Hide" : "Show"} {matching.length} course{matching.length !== 1 ? "s" : ""}
            </button>
          )}
          {open && (
            <ul className="mt-1 space-y-0.5">
              {matching.map((c) => {
                const st = getStatus(c);
                return (
                  <li key={c.code} className="flex items-center gap-1.5 text-xs">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[st]}`} />
                    <span className="font-mono text-green-700">{c.code}</span>
                    <span className="truncate text-gray-500">{c.title}</span>
                    <span className="text-gray-400">({c.credits} cr)</span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Approved electives subsection */}
          {req.electiveCourses && req.electiveCourses.length > 0 && (
            <div className="mt-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Approved Electives
              </p>
              <div className="flex flex-wrap gap-1.5">
                {req.electiveCourses.map((e) => {
                  const match = planned.find((c) => c.code === e.code);
                  const st    = match ? getStatus(match) : null;
                  const isPlanned = !!match;
                  return (
                    <span key={e.code} className="relative group cursor-default">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 font-mono text-xs font-medium transition-colors ${
                          st === "completed"   ? "bg-green-100 text-green-700 ring-1 ring-green-300"
                          : st === "in-progress" ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300"
                          : isPlanned            ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {e.code}
                      </span>
                      {/* Tooltip */}
                      <span
                        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5
                                   -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-800
                                   px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg
                                   transition-opacity group-hover:opacity-100"
                      >
                        {e.title}
                        <span className="ml-1.5 text-gray-400">{e.credits} cr</span>
                        {/* Arrow */}
                        <span
                          className="absolute left-1/2 top-full -translate-x-1/2 border-4
                                     border-transparent border-t-gray-800"
                        />
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function AttrReqRow({ req, planned }: { req: AttributeRequirement; planned: PlannedCourse[] }) {
  const { done, needed, matching } = matchAttrReq(req, planned);
  const met = done >= needed;
  const [open, setOpen] = useState(false);

  const hasCompleted  = matching.some((c) => getStatus(c) === "completed");
  const hasInProgress = matching.some((c) => getStatus(c) === "in-progress");
  const iconStatus: CourseStatus | null = met
    ? (hasCompleted ? "completed" : hasInProgress ? "in-progress" : "planned")
    : null;
  const badgeCls = met && hasCompleted  ? "bg-green-100 text-green-700"
    : met && hasInProgress              ? "bg-yellow-100 text-yellow-700"
    : met                               ? "bg-blue-100 text-blue-700"
    : "bg-gray-100 text-gray-500";

  return (
    <li className="py-2.5">
      <div className="flex items-start gap-3">
        <StatusIcon status={iconStatus} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-700">{req.description}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badgeCls}`}>
              {done}/{needed} course{needed !== 1 ? "s" : ""}
            </span>
          </div>
          {needed > 1 && <ProgressBar matching={matching} needed={needed} unit="count" />}

          {matching.length > 0 && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="mt-1.5 text-xs text-gray-400 hover:underline"
            >
              {open ? "Hide" : "Show"} {matching.length} course{matching.length !== 1 ? "s" : ""}
            </button>
          )}
          {open && (
            <ul className="mt-1 space-y-0.5">
              {matching.map((c) => {
                const st = getStatus(c);
                return (
                  <li key={c.code} className="flex items-center gap-1.5 text-xs">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[st]}`} />
                    <span className="font-mono text-green-700">{c.code}</span>
                    <span className="truncate text-gray-500">{c.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

function RequirementRow({ item, planned }: { item: MajorRequirementItem; planned: PlannedCourse[] }) {
  if (item.type === "course")    return <CourseReqRow  req={item as CourseRequirement}    planned={planned} />;
  if (item.type === "credits")   return <CreditReqRow  req={item as CreditRequirement}    planned={planned} />;
  if (item.type === "attribute") return <AttrReqRow    req={item as AttributeRequirement} planned={planned} />;
  return null;
}

// ---------------------------------------------------------------------------
// Section card
// ---------------------------------------------------------------------------

function RequirementSection({
  program,
  planned,
}: {
  program: ProgramDefinition;
  planned: PlannedCourse[];
}) {
  // Completion summary for the section header
  const { met, total } = useMemo(() => {
    let met = 0;
    let total = program.requirements.length;
    for (const req of program.requirements) {
      if (req.type === "course") {
        if (planned.some((c) => c.code === (req as CourseRequirement).code)) met++;
      } else if (req.type === "credits") {
        const { done, needed } = matchCreditReq(req as CreditRequirement, planned);
        if (done >= needed) met++;
      } else if (req.type === "attribute") {
        const { done, needed } = matchAttrReq(req as AttributeRequirement, planned);
        if (done >= needed) met++;
      }
    }
    return { met, total };
  }, [program, planned]);

  const allMet = met === total;

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-gray-800">{program.name}</h2>
          <p className="text-xs text-gray-400 capitalize">{program.type}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            allMet ? "bg-green-100 text-green-700" : "bg-amber-50 text-amber-600"
          }`}
        >
          {met}/{total} requirements met
        </span>
      </div>

      {/* Requirement rows */}
      <ul className="divide-y divide-gray-50 px-5">
        {program.requirements.map((item, i) => (
          <RequirementRow key={i} item={item} planned={planned} />
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const UNKNOWN = "Unknown";

function Field({ label, value, fallback = UNKNOWN }: { label: string; value: string | null; fallback?: string }) {
  const display = value ?? fallback;
  const isFallback = !value;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${isFallback ? "text-gray-400 italic" : "text-gray-800"}`}>
        {display}
      </p>
    </div>
  );
}

const UNDECLARED = "Undeclared";

export function RequirementsView() {
  const semesters    = usePlannerStore((s) => s.semesters);
  const planned      = useMemo(() => semesters.flatMap((s) => s.courses), [semesters]);
  const totalPlanned = useMemo(() => planned.reduce((s, c) => s + c.credits, 0), [planned]);

  const student = useStudentStore();

  // Determine if the student has a declared major matching one of our program definitions
  const declaredMajor = useMemo(() => {
    if (!student.major) return null;
    return MAJORS.find(
      (m) => m.name.toLowerCase() === student.major!.toLowerCase()
    ) ?? null;
  }, [student.major]);

  const isUndeclared = !declaredMajor;

  const [selectedMajor, setSelectedMajor] = useState<string>(MAJORS[0].name);
  const majorDef = useMemo(
    () => declaredMajor ?? MAJORS.find((m) => m.name === selectedMajor) ?? MAJORS[0],
    [declaredMajor, selectedMajor],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">

      {/* ── Scrollable content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="flex flex-col gap-5 max-w-3xl mx-auto">

          {/* ── Student info card ────────────────────────────────────────── */}
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-bold text-gray-800">Student Information</h2>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-3">
              <Field label="Name"       value={student.name} />
              <Field label="Email"      value={student.email} />
              <Field label="Student ID" value={student.studentId} />
              <Field label="Major"      value={student.major} fallback={UNDECLARED} />
              <Field label="Advisor"    value={student.advisor} />
            </div>
          </section>

          {/* ── Credits summary + optional major selector ─────────────────── */}
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-gray-100">
            {isUndeclared && (
              <div className="flex items-center gap-2">
                <label htmlFor="major-select" className="text-sm font-medium text-gray-600">
                  Viewing requirements for:
                </label>
                <select
                  id="major-select"
                  value={selectedMajor}
                  onChange={(e) => setSelectedMajor(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm
                             text-gray-800 shadow-sm focus:border-green-600 focus:outline-none
                             focus:ring-1 focus:ring-green-200"
                >
                  {MAJORS.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className={`${isUndeclared ? "" : "w-full"} flex items-center gap-1.5 text-sm text-gray-500 ${isUndeclared ? "ml-auto" : ""}`}>
              <span className="font-semibold text-gray-800">{totalPlanned}</span>
              <span>credits planned</span>
            </div>
          </div>

          {planned.length === 0 && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Your planner is empty. Add courses in the Planner or generate a schedule to see completion status.
            </div>
          )}

          <RequirementSection program={majorDef}        planned={planned} />
          <RequirementSection program={COLL_CURRICULUM} planned={planned} />
        </div>
      </div>
    </div>
  );
}
