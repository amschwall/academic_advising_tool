// file: app/planner/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { CoursePlanner } from "@/components/CoursePlanner";

interface Course {
  code: string;
  title: string;
  credits: number;
  prerequisiteCodes: string[];
  collAttribute: string | null;
  alv: boolean;
  csi: boolean;
  nqr: boolean;
  department: string;
  majorRestriction: string | null;
  sections: {
    professor: string;
    location: string;
    days: string;
    startTime: string | null;
    endTime: string | null;
  }[];
}

/** Fetch every page of /api/courses/search and return the full catalog. */
async function fetchAllCourses(): Promise<Course[]> {
  const all: Course[] = [];
  const limit = 500;
  let page = 1;

  while (true) {
    const res = await fetch(`/api/courses/search?limit=${limit}&page=${page}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const batch: Course[] = data.courses ?? [];
    all.push(...batch);
    if (all.length >= (data.total ?? 0) || batch.length === 0) break;
    page++;
  }

  return all;
}

export default function PlannerPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetchAllCourses()
      .then((c) => { setCourses(c); setLoading(false); })
      .catch((e) => { setError(`Failed to load courses: ${e.message}`); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading course catalog…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-red-600">
        {error}
      </div>
    );
  }

  return <CoursePlanner availableCourses={courses} />;
}
