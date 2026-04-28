// file: lib/stores/plannerStore.ts
import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlannedCourse {
  code: string;
  title: string;
  credits: number;
  prerequisiteCodes: string[];
  sections: { professor: string; location: string; days: string; startTime?: string | null; endTime?: string | null }[];
  // Gen-ed and proficiency designations (optional for backwards compat)
  collAttribute?: string | null;
  alv?: boolean;
  nqr?: boolean;
  csi?: boolean;
  langProf?: boolean;
  artsProf?: boolean;
  // Used for major/minor credit requirement matching
  department?: string;
}

export interface Semester {
  id: string;      // e.g. "year1-fall"
  label: string;   // e.g. "Year 1 Fall"
  year: number;    // 1-based
  season: "FALL" | "SPRING";
  courses: PlannedCourse[];
}

export interface PendingChange {
  type: "add" | "remove";
  semesterId: string;
  courseCode: string;
  year: number;
  season: "FALL" | "SPRING";
}

interface PlannerStore {
  semesters: Semester[];
  pendingChanges: PendingChange[];

  // Mutators
  addCourse: (semesterId: string, course: PlannedCourse) => void;
  removeCourse: (semesterId: string, courseCode: string) => void;
  addSemester: () => void;
  removeSemester: (semesterId: string) => void;
  clearPendingChanges: () => void;
  reset: () => void;

  // Derived queries — callable anywhere (store functions use get() internally)
  isPrereqSatisfied: (semesterId: string, course: PlannedCourse) => boolean;
  getSemesterCredits: (semesterId: string) => number;
  isDuplicate: (courseCode: string) => string | null; // returns semesterId if already placed
}

// ---------------------------------------------------------------------------
// Default semesters: Year 1–4 × Fall / Spring  (8 total)
// ---------------------------------------------------------------------------

function makeDefaultSemesters(): Semester[] {
  const semesters: Semester[] = [];
  for (let year = 1; year <= 4; year++) {
    semesters.push({ id: `year${year}-fall`,   label: `Year ${year} Fall`,   year, season: "FALL",   courses: [] });
    semesters.push({ id: `year${year}-spring`, label: `Year ${year} Spring`, year, season: "SPRING", courses: [] });
  }
  return semesters;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  semesters: makeDefaultSemesters(),
  pendingChanges: [],

  // ── addCourse ─────────────────────────────────────────────────────────────
  addCourse: (semesterId, course) => {
    set((state) => {
      const sem = state.semesters.find((s) => s.id === semesterId);
      const change: PendingChange = {
        type: "add",
        semesterId,
        courseCode: course.code,
        year:   sem?.year   ?? 1,
        season: sem?.season ?? "FALL",
      };
      return {
        semesters: state.semesters.map((s) =>
          s.id === semesterId ? { ...s, courses: [...s.courses, course] } : s
        ),
        pendingChanges: [...state.pendingChanges, change],
      };
    });
  },

  // ── removeCourse ──────────────────────────────────────────────────────────
  removeCourse: (semesterId, courseCode) => {
    set((state) => {
      // If an "add" for this exact slot is still pending, cancel it out
      let pendingAddIdx = -1;
      for (let i = state.pendingChanges.length - 1; i >= 0; i--) {
        const c = state.pendingChanges[i];
        if (c.type === "add" && c.semesterId === semesterId && c.courseCode === courseCode) {
          pendingAddIdx = i;
          break;
        }
      }

      const sem = state.semesters.find((s) => s.id === semesterId);
      const newPending: PendingChange[] =
        pendingAddIdx >= 0
          ? state.pendingChanges.filter((_, i) => i !== pendingAddIdx)
          : [
              ...state.pendingChanges,
              { type: "remove", semesterId, courseCode, year: sem?.year ?? 1, season: sem?.season ?? "FALL" },
            ];

      return {
        semesters: state.semesters.map((s) =>
          s.id === semesterId
            ? { ...s, courses: s.courses.filter((c) => c.code !== courseCode) }
            : s
        ),
        pendingChanges: newPending,
      };
    });
  },

  // ── addSemester ───────────────────────────────────────────────────────────
  addSemester: () => {
    set((state) => {
      const last = state.semesters[state.semesters.length - 1];
      let year   = last?.year ?? 4;
      let season: "FALL" | "SPRING" = last?.season === "FALL" ? "SPRING" : "FALL";
      if (last?.season === "SPRING") year += 1;
      const id    = `year${year}-${season.toLowerCase()}`;
      const label = `Year ${year} ${season === "FALL" ? "Fall" : "Spring"}`;
      return {
        semesters: [...state.semesters, { id, label, year, season, courses: [] }],
      };
    });
  },

  // ── removeSemester ────────────────────────────────────────────────────────
  removeSemester: (semesterId) => {
    set((state) => ({
      semesters: state.semesters.filter((s) => s.id !== semesterId),
    }));
  },

  clearPendingChanges: () => set({ pendingChanges: [] }),

  reset: () => set({ semesters: makeDefaultSemesters(), pendingChanges: [] }),

  // ── isPrereqSatisfied ─────────────────────────────────────────────────────
  // A course's prereqs are satisfied if every prereq code appears in a semester
  // that is strictly BEFORE semesterId in the ordered semesters array.
  isPrereqSatisfied: (semesterId, course) => {
    if (course.prerequisiteCodes.length === 0) return true;
    const { semesters } = get();
    const semIdx = semesters.findIndex((s) => s.id === semesterId);
    if (semIdx < 0) return false;
    const earlierCodes = new Set<string>();
    for (let i = 0; i < semIdx; i++) {
      semesters[i].courses.forEach((c) => earlierCodes.add(c.code));
    }
    return course.prerequisiteCodes.every((p) => earlierCodes.has(p));
  },

  // ── getSemesterCredits ────────────────────────────────────────────────────
  getSemesterCredits: (semesterId) => {
    const sem = get().semesters.find((s) => s.id === semesterId);
    return sem ? sem.courses.reduce((sum, c) => sum + c.credits, 0) : 0;
  },

  // ── isDuplicate ───────────────────────────────────────────────────────────
  isDuplicate: (courseCode) => {
    for (const s of get().semesters) {
      if (s.courses.some((c) => c.code === courseCode)) return s.id;
    }
    return null;
  },
}));
