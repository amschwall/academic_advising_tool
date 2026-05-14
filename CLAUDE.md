# W&M Academic Advising Platform — CLAUDE.md

A full-stack academic advising platform for William & Mary students. Students can plan their four-year course schedule, explore degree requirements, run "what-if" analyses for switching majors, and chat with an AI advisor.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| State management | Zustand 5 |
| Database ORM | Prisma 5 + PostgreSQL |
| Auth | Supabase (`@supabase/supabase-js`) |
| AI chat | OpenAI API (`gpt-4o`) via `openai` SDK |
| AI chat lib | `@anthropic-ai/sdk` also installed (legacy, largely replaced by OpenAI) |
| Drag-and-drop | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) |
| Unit tests | Jest 29 (two projects: `node` + `jsdom`) + ts-jest |
| E2E tests | Playwright |
| Course scraper | `tsx scripts/scrape-courses.ts` (node-html-parser) |

---

## Dev Commands

```bash
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run build        # Production build
npm start            # Start production server

npm test             # Run all Jest unit tests (node + jsdom projects)
npm run test:watch   # Jest in watch mode
npm run test:e2e     # Playwright E2E (requires dev server)
npm run test:e2e:ui  # Playwright with interactive UI
npm run test:e2e:prod # Build then run E2E against production build

npm run scrape       # Scrape Banner course catalog → upsert into DB
```

---

## Environment Variables

Required variables (validated at startup in `lib/env.ts`):

```
DATABASE_URL       # PostgreSQL connection string (Supabase pooler or direct)
SUPABASE_URL       # Supabase project URL
SUPABASE_ANON_KEY  # Supabase anonymous/public key
CLAUDE_API_KEY     # OpenAI API key (variable name kept from earlier Anthropic integration)
```

Place these in `.env.local` (not committed).

---

## Directory Structure

```
app/                    # Next.js App Router pages and API routes
  api/
    admin/users/        # GET all students (admin only)
    auth/login/         # POST — Supabase sign-in
    auth/logout/        # POST — Supabase sign-out
    auth/session/       # GET — current session info
    chat/               # POST — OpenAI chat (streaming)
    courses/search/     # GET — full-text course search
    health/             # GET — liveness probe
    schedule/generate/  # POST — AI schedule generation
    student/[id]/       # GET/PATCH student profile
    student/[id]/progress/ # GET graduation progress
  chat/page.tsx         # AI chat UI
  courses/page.tsx      # Course catalog browser
  planner/page.tsx      # Four-year planner (main page)
  requirements/page.tsx # Requirements view
  student-info/page.tsx # Student profile editor
  welcome/page.tsx      # Onboarding / welcome screen

components/             # Shared React components
  ChatPanel.tsx         # Right-side AI chat panel
  CoursePlanner.tsx     # Main planning grid (drag-drop, generator, what-if)
  CourseSearch.tsx      # Course search sidebar
  LoginForm.tsx         # Auth form
  RequirementTracker.tsx # Compact requirement status widget
  RequirementsView.tsx  # Full requirements breakdown
  WhatIfModal.tsx       # What-if major explorer modal

lib/
  ai-validator/         # Post-generation schedule validator (AI-specific checks)
  cache/                # In-memory caches (course search, validator results)
  claude/               # OpenAI client + prompt builder + types (named "claude" historically)
  cost/                 # API cost tracker (.cost-tracker.json)
  data/majors.ts        # Static catalog: all W&M majors, minors, concentrations + requirements
  db.ts                 # Prisma client singleton
  env.ts                # Environment variable validation
  generator/            # Schedule generation algorithm
    generator.ts        # Core placement algorithm
    logged-generator.ts # Wrapper that logs timing/result
    types.ts            # Input/output types
  logger/               # Request logging middleware
  middleware/withRole.ts # Role-based access control for API routes
  scraper/              # Banner HTML parser + DB store logic
  stores/               # Zustand client-side stores
    chatStore.ts        # Chat message history
    plannerStore.ts     # Semester grid state (courses, drag-drop)
    studentStore.ts     # Student profile (major, minor, year, etc.)
    whatIfStore.ts      # What-if analysis state + generateTriggerCount
  supabase.ts           # Supabase client factory
  validator/            # Rule-based schedule validator
    types.ts            # Shared types (ValidationError, ValidationResult, etc.)
    validator.ts        # Pure validation functions

prisma/
  schema.prisma         # DB schema
  migrations/           # Ordered SQL migrations

scripts/
  scrape-courses.ts     # Scrapes W&M Banner course catalog

tests/                  # All Jest + Playwright tests
  setup.ts              # Global test env setup (node)
  setup.dom.ts          # Global test env setup (jsdom)
```

---

## Database Schema

### Key Models

**Student** — one row per user. Fields: `id`, `email`, `name`, `major`, `minor`, `concentration`, `year` (academic year 1–4), `catalogYear` (matriculation year — determines which requirement set applies).

**Course** — one row per Banner course code. Fields: `code` (e.g. `CSCI301`), `title`, `credits`, `department`, `collAttribute` (e.g. `"COLL 100"`), boolean gen-ed flags (`alv`, `nqr`, `csi`), `majorRestriction` (department code if enrollment-restricted, e.g. `"LAW"`).

**Prerequisite** — join table `(courseId, prerequisiteId)`. No cycles allowed.

**Schedule** — a named four-year plan draft. One student can have multiple schedules.

**ScheduleItem** — one row per course-in-semester. Fields: `year`, `season` (FALL/SPRING/SUMMER/WINTER), `grade`, `completed`, optional `sectionId`.

**Section** — one Banner CRN offering. Fields: `crn`, `term`, `year`, `season`, `days` (e.g. `"MWF"`), `startTime`/`endTime` (12-h format, e.g. `"10:00am"`), `status` (`A`=open, `F`=full, `C`=cancelled).

**Requirement** / **RequirementCourse** — immutable requirement rows keyed by `catalogYear`. Types: `COLL`, `MAJOR`, `MINOR`, `ELECTIVE`.

---

## Academic Year Convention

**Critical:** The planner uses academic year numbering, not calendar years.

- Year 1 Fall and Year 1 Spring both have `year: 1`.
- Within a year, Fall comes before Spring.
- `SEASON_ORDER` in `lib/validator/validator.ts` must be `FALL=0, SPRING=1, SUMMER=2, WINTER=3`.
- Using calendar ordering (SPRING < FALL) causes every Fall→Spring prerequisite chain to be flagged as a violation.

---

## Static Requirements Catalog (`lib/data/majors.ts`)

Three program types: `MAJORS`, `MINORS`, `CONCENTRATIONS`. Each is a `ProgramDefinition` with an array of `MajorRequirementItem`:

- **`type: "course"`** — a specific required course (code, credits, prerequisiteCodes).
- **`type: "credits"`** — a credit-hour block, optionally filtered by department/level/approved elective list. Treated as electives in the generator.
- **`type: "attribute"`** — requires courses with a specific gen-ed attribute (e.g. `"ALV"`).

`getMajorDepartments(programs)` returns a `Set<string>` of all departments referenced by those programs — used to block school-restricted courses (e.g. LAW) from non-Law schedules.

---

## Schedule Generator (`lib/generator/generator.ts`)

**Input**: `GeneratorInput` — student, completed courses, major requirements, COLL requirements, elective pool, elective credits needed, planned semesters, section options, preferences, optional fill pool.

**Placement pipeline** (in order):

1. Build semester list and initialize credit counters.
2. Pre-seed credit counters from `completedCourses` so completed semesters are correctly weighted.
3. Topological sort of `majorRequirements` (prereq ordering), break ties with load-balancing.
4. Place COLL requirements — assign each to its earliest valid semester.
5. Place elective pool courses — fill remaining capacity semester by semester.
6. Place fill-pool courses — bring each semester up to a target credit load using general catalog courses.

**Required vs Elective separation:**

In `CoursePlanner.tsx`, `buildRequirementsFromPrograms()` routes items into two lists:
- `type:"course"` and `type:"attribute"` → `majorRequirements` (generator step 3–4, placed first).
- `type:"credits"` with a filter → `electivePool` (generator step 5, placed after required courses).
- `type:"credits"` without a filter → synthetic credit-block placeholders in `majorRequirements`.

This guarantees major required courses are spread evenly across all semesters before electives are added.

---

## What-If Analysis

`whatIfStore` manages an exploration mode where the user can try a different major/minor/concentration without affecting their real schedule.

- `generateTriggerCount: number` — incremented each time the user clicks "Generate Schedule". `CoursePlanner` watches this value to fire generation exactly once per click (avoids double-fires from re-renders).
- `activate(mode)` — sets `active: true` and closes the modal.
- `deactivate()` — sets `active: false` (selections preserved).
- `reset()` — clears everything.

---

## Course Search Filter (CoursePlanner)

The in-planner course search uses five independent filter states:
- `searchTitle`, `searchCode`, `searchDept`, `searchLevel`, `searchColl`

Results only appear when at least one filter is non-empty (`searchActive`). The results panel (w-72) opens to the left of the always-visible filter sidebar (w-60).

---

## Validation (`lib/validator/validator.ts`)

Pure functions, no side-effects:

| Function | Purpose |
|---|---|
| `checkPrerequisites` | Checks one course's prereqs against a satisfied-codes set |
| `checkSemesterCredits` | Checks min (12) / max (18) credit limits |
| `checkCollRequirements` | Checks which COLL levels are missing |
| `checkMajorRequirements` | Checks which required course codes are absent |
| `checkTimeConflicts` | Pairwise section time-overlap check within a semester |
| `validateCourseAddition` | Single-course add: prereqs + credit max + time conflict |
| `validateSchedule` | Full multi-semester schedule validation |
| `validateGraduationProgress` | Completed-courses-only graduation progress |

**Post-generation validation** (`app/api/schedule/generate/route.ts`):

Only `PREREQUISITE_NOT_MET` errors are surfaced as warnings after generation. `MISSING_MAJOR_COURSE` and credit-limit violations are expected artefacts of a partial plan and are suppressed. The `courseMap` passed to the validator must cover all course sources (major, COLL, electives, fill pool) to avoid false `INVALID_COURSE` errors.

---

## Course Restriction Logic

`majorRestriction` DB column stores a department code for enrollment-restricted courses (e.g. `"LAW"` for Law School courses).

In `CoursePlanner.tsx`:
- `allKnownDepts = getMajorDepartments([...MAJORS, ...MINORS, ...CONCENTRATIONS])`
- Courses are filtered out of `shuffledCourses` and `fillPool` if they have a `majorRestriction` that doesn't match the active major's departments, OR if their department isn't in `allKnownDepts` (and they have no gen-ed flags).

Migration `20260510000000_populate_major_restriction` populates `majorRestriction = 'LAW'` for all LAW-department courses.

---

## Testing

**Jest** — two projects run in parallel:

- `node` — API routes, generator, validator, stores (`.test.ts` files).
- `jsdom` — React component tests (`.test.tsx` files).

Both use ts-jest with `@/` path alias mapped to project root.

Setup files: `tests/setup.ts` (both), `tests/setup.dom.ts` (jsdom).

**Playwright** — E2E tests in `tests/` matching `.spec.ts` pattern (configured in `playwright.config.ts`). Requires dev server running unless using `test:e2e:prod`.

---

## API Routes Summary

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/login` | Supabase email/password sign-in |
| POST | `/api/auth/logout` | Sign-out |
| GET | `/api/auth/session` | Current session user |
| GET | `/api/courses/search` | Full-text course search (cached) |
| POST | `/api/chat` | OpenAI gpt-4o streaming chat |
| POST | `/api/schedule/generate` | Generate four-year schedule |
| GET | `/api/student/[id]` | Student profile |
| PATCH | `/api/student/[id]` | Update student profile |
| GET | `/api/student/[id]/progress` | Graduation progress |
| GET | `/api/admin/users` | List all students (admin role required) |
| GET | `/api/health` | Liveness probe |

All routes use `withLogging` middleware from `lib/logger/middleware.ts`.

---

## Logging & Cost Tracking

- `lib/logger/` — request/response logging middleware wrapping all API handlers.
- `lib/cost/tracker.ts` — tracks OpenAI API token costs, persisted to `.cost-tracker.json`.

---

## Key Conventions

- **No calendar-year season ordering** — always use `FALL=0, SPRING=1` within the same academic year.
- **Required before elective** — `majorRequirements` is placed in generator steps 3–4; `electivePool` in step 5.
- **Completed courses are preserved** — when regenerating, completed courses are saved, planner is cleared, then completed courses are re-added before new courses are placed.
- **`generateTriggerCount`** — the canonical pattern to trigger a one-shot effect from a Zustand store event.
- **Immutable requirements** — `Requirement` rows are never modified; new catalog years get new rows.
- **Section status codes** — `A` = open, `F` = full, `C` = cancelled (Banner convention).
