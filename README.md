# Academic Advising Platform

A TDD-first academic advising tool built with Next.js 14, TypeScript, Prisma, PostgreSQL, and the Claude API. Helps students plan course schedules, track degree requirements, and get AI-powered advising recommendations.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **ORM**: Prisma + PostgreSQL
- **Auth**: Supabase
- **AI**: Anthropic Claude API
- **Testing**: Jest + ts-jest + supertest

## Project Structure

```
app/            Next.js App Router routes and API handlers
lib/            Shared utilities (db client, env validation)
prisma/         Database schema and migrations
tests/          Jest test suite
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL (local or via Docker)
- A Supabase project
- An Anthropic API key

### Install dependencies

```bash
npm install
```

### Configure environment variables

Copy `.env.test` as a reference and create a `.env.local` for local development:

```bash
cp .env.test .env.local
```

Fill in real values in `.env.local`:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/advising_dev
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
CLAUDE_API_KEY=sk-ant-...
```

### Set up the database

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### Run the development server

```bash
npm run dev
```

### Run tests

```bash
# Run all tests once
npm test

# Run in watch mode
npm run test:watch
```

Tests require a running PostgreSQL instance pointed to by `DATABASE_URL` in `.env.test`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check — returns `{ status: "ok" }` |

Additional endpoints (courses, schedules, student progress) are planned in later phases.

## Development Phases

1. **Foundation** — config, env validation, DB client, health endpoint (current)
2. **Authentication** — Supabase SSO integration
3. **Authorization** — role-based access control
4. **Data Layer** — Prisma models, migrations, seed data
5. **Web Scraper** — course catalog ingestion
6. **Validation Engine** — prerequisite and requirement checking
7. **Scheduling** — AI-assisted schedule generation
8. **Caching** — Redis layer for expensive queries
9. **Claude API Integration** — LLM-powered course recommendations
10. **API Endpoints** — course search, schedule generation, progress tracking
11. **Frontend Components** — course search, drag-drop planner, progress tracker, chat interface
12. **E2E & Adversarial Tests** — Playwright, load testing, edge cases
