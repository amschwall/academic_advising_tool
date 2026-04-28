// file: app/planner/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { CoursePlanner } from "@/components/CoursePlanner";

interface Course {
  code: string;
  title: string;
  credits: number;
  prerequisiteCodes: string[];
  sections: { professor: string; location: string; days: string }[];
}

export default function PlannerPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/courses/search?limit=200")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data) => {
        setCourses(data.courses ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(`Failed to load courses: ${e.message}`);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading courses…
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
