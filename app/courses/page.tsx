// file: app/courses/page.tsx
import Link from "next/link";
import { CourseSearch } from "@/components/CourseSearch";

export default function CoursesPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">

      {/* ── Top bar (matches planner) ───────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-lg font-bold text-green-900">Course Catalog</h1>
            <p className="text-xs text-gray-400">William &amp; Mary Academic Advising</p>
          </div>
          <nav className="flex items-center gap-1">
            <Link
              href="/planner"
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            >
              Planner
            </Link>
            <Link
              href="/courses"
              className="rounded-lg bg-green-50 px-4 py-2 text-sm font-medium text-green-800"
            >
              Course Catalog
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <CourseSearch />
    </div>
  );
}
