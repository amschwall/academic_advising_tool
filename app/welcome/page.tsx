// file: app/welcome/page.tsx
import Link from "next/link";

const PAGES = [
  {
    href:        "/planner",
    title:       "Four-Year Planner",
    description: "Build and manage your semester-by-semester course plan. Generate a full schedule automatically, drag and drop courses, and track credits across all eight semesters.",
    icon: (
      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    href:        "/courses",
    title:       "Course Catalog",
    description: "Browse all William & Mary course offerings. Filter by department, level, credits, COLL attribute, meeting days, and gen-ed designations to find the right courses for your plan.",
    icon: (
      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    href:        "/student-info",
    title:       "Student Info",
    description: "See your student information and track major and gen-ed requirements. View completion status based on your current planner.",
    icon: (
      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function WelcomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-14 text-center">
        <div className="mb-3 inline-flex items-center gap-2">
          <span className="text-4xl font-black tracking-tight text-green-900">W&amp;M</span>
          <span className="h-8 w-px bg-green-200" />
          <span className="text-2xl font-semibold text-green-800">Academic Advising</span>
        </div>
        <p className="text-base text-gray-500">Welcome! Where would you like to start?</p>
      </div>

      {/* ── Cards ──────────────────────────────────────────────────────────── */}
      <div className="grid w-full max-w-5xl gap-6 sm:grid-cols-3">
        {PAGES.map(({ href, title, description, icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-3xl bg-white p-8 shadow-sm ring-1 ring-gray-100
                       transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:ring-green-200"
          >
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl
                            bg-green-50 text-green-700 transition-colors group-hover:bg-green-100">
              {icon}
            </div>
            <h2 className="mb-2 text-lg font-bold text-gray-900 group-hover:text-green-900">
              {title}
            </h2>
            <p className="flex-1 text-sm leading-relaxed text-gray-500">
              {description}
            </p>
            <div className="mt-6 flex items-center gap-1 text-sm font-medium text-green-700
                            opacity-0 transition-opacity group-hover:opacity-100">
              Open
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-1"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
