// file: components/CourseSearch.tsx
"use client";

import React, { useState, useEffect } from "react";

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
  "COLL 500",
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
  collAttribute: string | null;
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
// Shared input / select styles
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm " +
  "placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100";

const selectCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm " +
  "focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100 bg-white";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CourseSearch() {
  const [query, setQuery]               = useState("");
  const [department, setDepartment]     = useState("");
  const [collAttribute, setCollAttribute] = useState("");

  const [page, setPage]   = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams();
    if (query)         params.set("title",         query);
    if (department)    params.set("department",    department);
    if (collAttribute) params.set("collAttribute", collAttribute);
    params.set("page", String(page));

    setLoading(true);
    setError(false);

    fetch(`/api/courses/search?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json() as Promise<SearchResponse>;
      })
      .then((data) => {
        setCourses(data.courses);
        setTotal(data.total);
        setLimit(data.limit);
        setLoading(false);
      })
      .catch(() => {
        setCourses([]);
        setError(true);
        setLoading(false);
      });
  }, [query, department, collAttribute, page]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setPage(1);
  }

  function handleDepartmentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setDepartment(e.target.value);
    setPage(1);
  }

  function handleCollChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setCollAttribute(e.target.value);
    setPage(1);
  }

  function toggleExpand(code: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">

          {/* Search */}
          <div className="min-w-[220px] flex-1">
            <label htmlFor="search" className="mb-1 block text-xs font-medium text-gray-600">
              Search
            </label>
            <input
              id="search"
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Title, keyword…"
              className={inputCls}
            />
          </div>

          {/* Department */}
          <div className="w-44">
            <label htmlFor="department" className="mb-1 block text-xs font-medium text-gray-600">
              Department
            </label>
            <select id="department" value={department} onChange={handleDepartmentChange} className={selectCls}>
              <option value="">All departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* COLL attribute */}
          <div className="w-40">
            <label htmlFor="coll" className="mb-1 block text-xs font-medium text-gray-600">
              COLL Attribute
            </label>
            <select id="coll" value={collAttribute} onChange={handleCollChange} className={selectCls}>
              <option value="">Any</option>
              {COLL_LEVELS.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>

          {/* Result count */}
          {!loading && !error && (
            <p className="shrink-0 text-xs text-gray-400">
              {total.toLocaleString()} course{total !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* ── Scrollable results ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* Loading */}
        {loading && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-gray-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-green-600" />
            Loading…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            Failed to load courses. Please try again.
          </div>
        )}

        {/* Empty */}
        {!loading && !error && courses.length === 0 && (
          <div className="mt-16 text-center">
            <p className="text-3xl text-gray-200">🔍</p>
            <p className="mt-2 text-sm text-gray-400">No courses found</p>
            <p className="text-xs text-gray-300">Try adjusting your filters.</p>
          </div>
        )}

        {/* Course cards */}
        {!loading && !error && (
          <div className="flex flex-col gap-3">
            {courses.map((course) => {
              const isExpanded = expanded.has(course.code);
              const section    = course.sections?.[0];

              return (
                <article
                  key={course.code}
                  className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 transition-shadow hover:shadow-md"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="font-mono text-sm font-semibold text-green-800">
                          {course.code}
                        </strong>
                        <span className="text-sm font-medium text-gray-800">{course.title}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-400">{course.department}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {course.credits} cr
                        </span>
                        {course.collAttribute && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            {course.collAttribute}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => toggleExpand(course.code)}
                      className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs
                                 font-medium text-gray-600 hover:border-green-300 hover:text-green-700
                                 transition-colors"
                    >
                      {isExpanded ? "Hide details" : "Show details"}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                      {/* Prerequisites */}
                      <div>
                        <p className="text-xs font-medium text-gray-400 mb-0.5">Prerequisites</p>
                        <p className="text-sm text-gray-700">
                          {course.prerequisiteCodes.length > 0
                            ? course.prerequisiteCodes.join(", ")
                            : "None"}
                        </p>
                      </div>

                      {/* Sections */}
                      {course.sections.length > 0 ? (
                        <div>
                          <p className="text-xs font-medium text-gray-400 mb-1">Sections</p>
                          <div className="divide-y divide-gray-50">
                            {course.sections.map((s, i) => {
                              const time =
                                s.startTime && s.endTime ? `${s.startTime}–${s.endTime}`
                                : s.startTime            ? s.startTime
                                : null;
                              return (
                                <dl key={i} className="grid grid-cols-2 gap-x-4 gap-y-1 py-2 text-sm sm:grid-cols-4">
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
                                    <dd className="text-gray-700">{time ?? "TBA"}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-gray-400">Location</dt>
                                    <dd className="text-gray-700">{s.location}</dd>
                                  </div>
                                </dl>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm italic text-gray-400">No section info available</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium
                         text-gray-600 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed
                         disabled:opacity-40 transition-colors"
            >
              Prev
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium
                         text-gray-600 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed
                         disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
