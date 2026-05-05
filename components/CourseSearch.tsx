// file: components/CourseSearch.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Static filter data
// ---------------------------------------------------------------------------

const DEPARTMENTS = [
  "AMST", "ANTH", "ARTH", "BIOL", "CHEM", "CHIN", "CLCV",
  "CSCI", "DATA", "ECON", "EDUC", "ENGL", "FREN", "GEOL",
  "GERM", "GOVT", "HISP", "HIST", "ITAL", "JAPN", "KINE",
  "LING", "MATH", "MUSC", "PHIL", "PHYS", "PSYC", "RELG",
  "RUSS", "SOCL", "THEA", "WGSS",
];

const COLL_LEVELS = [
  "COLL 100",
  "COLL 150",
  "COLL 200",
  "COLL 300",
  "COLL 350",
  "COLL 400",
];

const COURSE_LEVELS = [100, 200, 300, 400];

const DAYS_OPTIONS = [
  { label: "MWF",  value: "MWF" },
  { label: "TR",   value: "TR" },
  { label: "MW",   value: "MW" },
  { label: "M",    value: "M" },
  { label: "T",    value: "T" },
  { label: "W",    value: "W" },
  { label: "R",    value: "R" },
  { label: "F",    value: "F" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseSection {
  professor: string;
  location: string;
  days: string;
  startTime?: string | null;
  endTime?: string | null;
}

interface Course {
  code: string;
  title: string;
  department: string;
  credits: number;
  description?: string | null;
  collAttribute: string | null;
  alv: boolean;
  csi: boolean;
  nqr: boolean;
  majorRestriction?: string | null;
  prerequisiteCodes: string[];
  sections: CourseSection[];
}

interface SearchResponse {
  courses: Course[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCourseLevel(code: string): number {
  const m = code.match(/(\d{3})/);
  return m ? Math.floor(parseInt(m[1], 10) / 100) * 100 : 0;
}

function formatTime(s: CourseSection): string {
  if (s.startTime && s.endTime) return `${s.startTime}–${s.endTime}`;
  if (s.startTime) return s.startTime;
  return "TBA";
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 " +
  "placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-200";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 " +
  "focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-200";

// ---------------------------------------------------------------------------
// Sidebar section label
// ---------------------------------------------------------------------------

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Course card
// ---------------------------------------------------------------------------

function CourseCard({ course, isExpanded, onToggle }: {
  course: Course;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const firstSection = course.sections[0];

  return (
    <article className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 transition-shadow hover:shadow-md">
      {/* ── Collapsed header ─────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-start gap-4"
        aria-expanded={isExpanded}
      >
        {/* Left: course info */}
        <div className="flex-1 min-w-0">
          {/* Top row: code + title */}
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-sm font-bold text-green-800">{course.code}</span>
            <span className="text-sm font-semibold text-gray-800 truncate">{course.title}</span>
          </div>

          {/* Badges row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {course.credits} cr
            </span>
            {course.collAttribute && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                {course.collAttribute}
              </span>
            )}
            {course.alv && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">ALV</span>
            )}
            {course.csi && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">CSI</span>
            )}
            {course.nqr && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">NQR</span>
            )}
          </div>

          {/* Section preview */}
          {firstSection && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span className="font-medium text-gray-600">{firstSection.professor}</span>
              {firstSection.days && <span>{firstSection.days}</span>}
              <span>{formatTime(firstSection)}</span>
              {course.sections.length > 1 && (
                <span className="text-gray-300">+{course.sections.length - 1} more section{course.sections.length > 2 ? "s" : ""}</span>
              )}
            </div>
          )}
          {!firstSection && (
            <p className="mt-2 text-xs text-gray-300 italic">No sections listed</p>
          )}
        </div>

        {/* Chevron */}
        <span className="shrink-0 mt-0.5 text-gray-400">
          {isExpanded ? (
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          )}
        </span>
      </button>

      {/* ── Expanded details ─────────────────────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">

          {/* Description */}
          {course.description && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">Description</p>
              <p className="text-sm text-gray-700 leading-relaxed">{course.description}</p>
            </div>
          )}

          {/* Major restriction */}
          {course.majorRestriction && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">Major Restriction</p>
              <p className="text-sm text-amber-700 font-medium">
                Enrollment restricted to {course.majorRestriction} majors
              </p>
            </div>
          )}

          {/* Prerequisites */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">Prerequisites</p>
            <p className="text-sm text-gray-700">
              {course.prerequisiteCodes.length > 0
                ? course.prerequisiteCodes.join(", ")
                : "None"}
            </p>
          </div>

          {/* Sections */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">Sections</p>
            {course.sections.length > 0 ? (
              <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                {course.sections.map((s, i) => (
                  <dl key={i} className="grid grid-cols-2 gap-x-4 gap-y-1 bg-gray-50/50 px-4 py-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-gray-400">Professor</dt>
                      <dd className="text-gray-700">{s.professor}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-400">Days</dt>
                      <dd className="text-gray-700">{s.days || "TBA"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-400">Time</dt>
                      <dd className="text-gray-700">{formatTime(s)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-400">Location</dt>
                      <dd className="text-gray-700">{s.location}</dd>
                    </div>
                  </dl>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-gray-400">No section info available</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CourseSearch() {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [titleQuery, setTitleQuery] = useState("");
  const [codeQuery,  setCodeQuery]  = useState("");
  const [department,    setDepartment]    = useState("");
  const [credits,       setCredits]       = useState("");
  const [level,         setLevel]         = useState("");
  const [collAttribute, setCollAttribute] = useState("");
  const [days,          setDays]          = useState("");
  const [alv, setAlv] = useState(false);
  const [csi, setCsi] = useState(false);
  const [nqr, setNqr] = useState(false);

  // ── Debounced text values ─────────────────────────────────────────────────
  const [debouncedTitle, setDebouncedTitle] = useState("");
  const [debouncedCode,  setDebouncedCode]  = useState("");
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setTitleQuery(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => { setDebouncedTitle(v); setPage(1); }, 300);
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setCodeQuery(v);
    if (codeTimer.current) clearTimeout(codeTimer.current);
    codeTimer.current = setTimeout(() => { setDebouncedCode(v); setPage(1); }, 300);
  }

  // ── Pagination + results ──────────────────────────────────────────────────
  const [page,  setPage]  = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedTitle) params.set("title",      debouncedTitle);
    if (debouncedCode)  params.set("code",       debouncedCode);
    if (department)     params.set("department", department);
    if (credits)        params.set("credits",    credits);
    if (collAttribute)  params.set("collAttribute", collAttribute);
    if (days)           params.set("days",       days);
    if (alv)            params.set("alv",        "true");
    if (csi)            params.set("csi",        "true");
    if (nqr)            params.set("nqr",        "true");
    params.set("page", String(page));

    setLoading(true);
    setError(false);

    fetch(`/api/courses/search?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<SearchResponse>;
      })
      .then((data) => {
        let results = data.courses;

        // Client-side level filter (course level is derived from numeric part of code)
        if (level) {
          const lvl = parseInt(level, 10);
          results = results.filter((c) => getCourseLevel(c.code) === lvl);
        }

        setCourses(results);
        setTotal(level ? results.length : data.total);
        setLimit(data.limit);
        setLoading(false);
      })
      .catch(() => {
        setCourses([]);
        setError(true);
        setLoading(false);
      });
  }, [debouncedTitle, debouncedCode, department, credits, collAttribute, days, alv, csi, nqr, level, page]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function resetFilters() {
    setTitleQuery(""); setDebouncedTitle("");
    setCodeQuery("");  setDebouncedCode("");
    setDepartment(""); setCredits(""); setLevel("");
    setCollAttribute(""); setDays("");
    setAlv(false); setCsi(false); setNqr(false);
    setPage(1);
  }

  function toggleExpand(code: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  const totalPages    = limit > 0 ? Math.ceil(total / limit) : 1;
  const activeFilters =
    !!(debouncedTitle || debouncedCode || department || credits || level ||
       collAttribute || days || alv || csi || nqr);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-5 py-6 space-y-5">

        {/* Title search */}
        <div>
          <FilterLabel>Title / Keyword</FilterLabel>
          <input
            type="text"
            value={titleQuery}
            onChange={handleTitleChange}
            placeholder="e.g. Algorithms"
            className={inputCls}
          />
        </div>

        {/* Code search */}
        <div>
          <FilterLabel>Course Code</FilterLabel>
          <input
            type="text"
            value={codeQuery}
            onChange={handleCodeChange}
            placeholder="e.g. CSCI301"
            className={inputCls}
          />
        </div>

        {/* Department */}
        <div>
          <FilterLabel>Department</FilterLabel>
          <select
            value={department}
            onChange={(e) => { setDepartment(e.target.value); setPage(1); }}
            className={selectCls}
          >
            <option value="">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Credits */}
        <div>
          <FilterLabel>Credits</FilterLabel>
          <select
            value={credits}
            onChange={(e) => { setCredits(e.target.value); setPage(1); }}
            className={selectCls}
          >
            <option value="">Any</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={String(n)}>{n} credit{n !== 1 ? "s" : ""}</option>
            ))}
          </select>
        </div>

        {/* Course level */}
        <div>
          <FilterLabel>Course Level</FilterLabel>
          <select
            value={level}
            onChange={(e) => { setLevel(e.target.value); setPage(1); }}
            className={selectCls}
          >
            <option value="">Any level</option>
            {COURSE_LEVELS.map((l) => (
              <option key={l} value={String(l)}>{l}-level</option>
            ))}
          </select>
        </div>

        {/* COLL attribute */}
        <div>
          <FilterLabel>COLL Attribute</FilterLabel>
          <select
            value={collAttribute}
            onChange={(e) => { setCollAttribute(e.target.value); setPage(1); }}
            className={selectCls}
          >
            <option value="">Any</option>
            {COLL_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Days */}
        <div>
          <FilterLabel>Meeting Days</FilterLabel>
          <select
            value={days}
            onChange={(e) => { setDays(e.target.value); setPage(1); }}
            className={selectCls}
          >
            <option value="">Any days</option>
            {DAYS_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        {/* Gen-ed designations */}
        <div>
          <FilterLabel>Designation</FilterLabel>
          <div className="space-y-2">
            {([
              { label: "ALV — Arts, Literature & Values", state: alv, set: setAlv },
              { label: "CSI — Culture, Society & Identity", state: csi, set: setCsi },
              { label: "NQR — Natural, Quantitative & Reasoning", state: nqr, set: setNqr },
            ] as const).map(({ label, state, set }) => (
              <label key={label} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state}
                  onChange={(e) => { set(e.target.checked); setPage(1); }}
                  className="mt-0.5 h-3.5 w-3.5 accent-green-600"
                />
                <span className="text-xs text-gray-600 leading-snug">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Reset */}
        {activeFilters && (
          <button
            onClick={resetFilters}
            className="w-full rounded-lg border border-gray-200 py-2 text-xs font-medium
                       text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors"
          >
            Reset filters
          </button>
        )}
      </aside>

      {/* ── Right content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">

        {/* Result count header */}
        <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
          {loading ? (
            <span className="flex items-center gap-2 text-sm text-gray-400">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-green-600" />
              Loading…
            </span>
          ) : error ? (
            <span className="text-sm text-red-500">Failed to load courses.</span>
          ) : (
            <span className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{total.toLocaleString()}</span>{" "}
              course{total !== 1 ? "s" : ""}
              {level ? <span className="ml-1 text-gray-400">(on this page matching {level}-level)</span> : ""}
            </span>
          )}

          {/* Pagination inline */}
          {!loading && !error && totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium
                           text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Prev
              </button>
              <span className="text-xs text-gray-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium
                           text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Scrollable results */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Error */}
          {!loading && error && (
            <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              Failed to load courses. Please try again.
            </div>
          )}

          {/* Empty */}
          {!loading && !error && courses.length === 0 && (
            <div className="mt-24 text-center">
              <p className="text-4xl text-gray-200">🔍</p>
              <p className="mt-3 text-sm font-medium text-gray-400">No courses match your filters</p>
              <p className="text-xs text-gray-300">Try adjusting or resetting the filters on the left.</p>
            </div>
          )}

          {/* Cards */}
          {!loading && !error && courses.length > 0 && (
            <div className="flex flex-col gap-3">
              {courses.map((course) => (
                <CourseCard
                  key={course.code}
                  course={course}
                  isExpanded={expanded.has(course.code)}
                  onToggle={() => toggleExpand(course.code)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
