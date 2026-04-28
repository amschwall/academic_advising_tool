// file: tests/requirement-tracker.test.tsx

/**
 * Phase 15 — Requirement Progress Tracker
 *
 * Tests for <RequirementTracker completedCourses={[]} transferCourses={[]} />
 *
 * Component: components/RequirementTracker.tsx
 * Store:     lib/stores/plannerStore.ts  (reads semesters live via subscription)
 *
 * W&M graduation requirements tracked:
 *   COLL:         100, 150, 200-NQR, 200-CSI, 200-ALV, 300, 350, 500
 *   Gen-Ed:       Non-200 NQR, Non-200 CSI, Non-200 ALV  (separate from COLL 200)
 *   Proficiency:  Language, Arts
 *   Credits:      120 minimum (hard floor; students can exceed)
 *
 * Row status values (on data-status attribute of each role="listitem"):
 *   "missing"   — no qualifying course found anywhere         → red
 *   "planned"   — qualifying course placed in planner store   → yellow
 *   "completed" — qualifying course in completedCourses or
 *                 transferCourses prop                        → green
 *   completed > planned in priority when both apply.
 *
 * PlannedCourse fields used for requirement matching:
 *   collAttribute: "COLL 100"|"COLL 150"|"COLL 200"|"COLL 300"|"COLL 350"|"COLL 500"|null
 *   nqr, csi, alv: boolean   — general-education designations
 *   langProf, artsProf: boolean — proficiency flags
 *   credits: number
 *
 * The tracker starts COLLAPSED; clicking "View Requirements" expands it.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequirementTracker } from "@/components/RequirementTracker";
import { usePlannerStore, type PlannedCourse } from "@/lib/stores/plannerStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal PlannedCourse — override only the fields relevant to each test. */
function makeCourse(overrides: Partial<PlannedCourse> = {}): PlannedCourse {
  return {
    code: "TEST101",
    title: "Test Course",
    credits: 3,
    prerequisiteCodes: [],
    sections: [],
    collAttribute: null,
    alv: false,
    nqr: false,
    csi: false,
    langProf: false,
    artsProf: false,
    ...overrides,
  };
}

/** Click the toggle button to open the tracker panel. */
async function openTracker() {
  await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
}

/** Return the listitem row for a given data-testid. */
function getRow(testId: string) {
  return screen.getByTestId(testId);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  usePlannerStore.getState().reset();
});

// ===========================================================================
// 1. EXPAND / COLLAPSE
// ===========================================================================

describe("RequirementTracker – expand / collapse", () => {
  it("renders a 'View Requirements' toggle button", () => {
    render(<RequirementTracker />);
    expect(screen.getByRole("button", { name: /view requirements/i })).toBeInTheDocument();
  });

  it("is collapsed by default — requirement list is not in the DOM", () => {
    render(<RequirementTracker />);
    expect(screen.queryByRole("list", { name: /degree requirements/i })).not.toBeInTheDocument();
  });

  it("expands the panel when toggle is clicked", async () => {
    render(<RequirementTracker />);
    await openTracker();
    expect(screen.getByRole("list", { name: /degree requirements/i })).toBeInTheDocument();
  });

  it("changes toggle label to 'Hide Requirements' when expanded", async () => {
    render(<RequirementTracker />);
    await openTracker();
    expect(screen.getByRole("button", { name: /hide requirements/i })).toBeInTheDocument();
  });

  it("collapses again when toggled a second time", async () => {
    render(<RequirementTracker />);
    await openTracker();
    await userEvent.click(screen.getByRole("button", { name: /hide requirements/i }));
    expect(screen.queryByRole("list", { name: /degree requirements/i })).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 2. COMPLETION DISPLAY — all required rows are present when expanded
// ===========================================================================

describe("RequirementTracker – completion display", () => {
  beforeEach(async () => {
    render(<RequirementTracker />);
    await openTracker();
  });

  // COLL rows
  it("shows a COLL 100 row", () => {
    expect(getRow("req-coll-100")).toBeInTheDocument();
  });
  it("shows a COLL 150 row", () => {
    expect(getRow("req-coll-150")).toBeInTheDocument();
  });
  it("shows a COLL 200 – NQR row", () => {
    expect(getRow("req-coll-200-nqr")).toBeInTheDocument();
  });
  it("shows a COLL 200 – CSI row", () => {
    expect(getRow("req-coll-200-csi")).toBeInTheDocument();
  });
  it("shows a COLL 200 – ALV row", () => {
    expect(getRow("req-coll-200-alv")).toBeInTheDocument();
  });
  it("shows a COLL 300 row", () => {
    expect(getRow("req-coll-300")).toBeInTheDocument();
  });
  it("shows a COLL 350 row", () => {
    expect(getRow("req-coll-350")).toBeInTheDocument();
  });
  it("shows a COLL 500 row", () => {
    expect(getRow("req-coll-500")).toBeInTheDocument();
  });

  // Non-200 gen-ed rows
  it("shows a Non-200 NQR gen-ed row", () => {
    expect(getRow("req-nqr")).toBeInTheDocument();
  });
  it("shows a Non-200 CSI gen-ed row", () => {
    expect(getRow("req-csi")).toBeInTheDocument();
  });
  it("shows a Non-200 ALV gen-ed row", () => {
    expect(getRow("req-alv")).toBeInTheDocument();
  });

  // Proficiency rows
  it("shows a Language Proficiency row", () => {
    expect(getRow("req-lang-prof")).toBeInTheDocument();
  });
  it("shows an Arts Proficiency row", () => {
    expect(getRow("req-arts-prof")).toBeInTheDocument();
  });

  // Human-readable labels are visible
  it("renders visible text labels for each requirement", () => {
    expect(within(getRow("req-coll-100")).getByText(/coll 100/i)).toBeInTheDocument();
    expect(within(getRow("req-coll-150")).getByText(/coll 150/i)).toBeInTheDocument();
    expect(within(getRow("req-coll-200-nqr")).getByText(/nqr/i)).toBeInTheDocument();
    expect(within(getRow("req-coll-200-csi")).getByText(/csi/i)).toBeInTheDocument();
    expect(within(getRow("req-coll-200-alv")).getByText(/alv/i)).toBeInTheDocument();
    expect(within(getRow("req-coll-300")).getByText(/coll 300/i)).toBeInTheDocument();
    expect(within(getRow("req-coll-350")).getByText(/coll 350/i)).toBeInTheDocument();
    expect(within(getRow("req-coll-500")).getByText(/coll 500/i)).toBeInTheDocument();
    expect(within(getRow("req-lang-prof")).getByText(/language/i)).toBeInTheDocument();
    expect(within(getRow("req-arts-prof")).getByText(/arts/i)).toBeInTheDocument();
  });
});

// ===========================================================================
// 3. MISSING REQUIREMENT HIGHLIGHTING
// ===========================================================================

describe("RequirementTracker – missing status (red)", () => {
  beforeEach(async () => {
    render(<RequirementTracker />);
    await openTracker();
  });

  it("all COLL rows are 'missing' when the planner is empty", () => {
    for (const id of [
      "req-coll-100", "req-coll-150",
      "req-coll-200-nqr", "req-coll-200-csi", "req-coll-200-alv",
      "req-coll-300", "req-coll-350", "req-coll-500",
    ]) {
      expect(getRow(id)).toHaveAttribute("data-status", "missing");
    }
  });

  it("all gen-ed rows are 'missing' when the planner is empty", () => {
    for (const id of ["req-nqr", "req-csi", "req-alv"]) {
      expect(getRow(id)).toHaveAttribute("data-status", "missing");
    }
  });

  it("all proficiency rows are 'missing' when the planner is empty", () => {
    expect(getRow("req-lang-prof")).toHaveAttribute("data-status", "missing");
    expect(getRow("req-arts-prof")).toHaveAttribute("data-status", "missing");
  });

  it("COLL 200 NQR row stays 'missing' when only CSI COLL 200 is planned", async () => {
    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: "KINE200C",
        collAttribute: "COLL 200",
        csi: true,
      }));
    });

    expect(getRow("req-coll-200-nqr")).toHaveAttribute("data-status", "missing");
    expect(getRow("req-coll-200-alv")).toHaveAttribute("data-status", "missing");
  });

  it("Non-200 NQR row stays 'missing' when only a COLL 200 NQR course is planned", async () => {
    // A COLL 200 NQR course satisfies req-coll-200-nqr, NOT req-nqr
    act(() => {
      usePlannerStore.getState().addCourse("year2-fall", makeCourse({
        code: "COLL200N",
        collAttribute: "COLL 200",
        nqr: true,
      }));
    });

    expect(getRow("req-coll-200-nqr")).toHaveAttribute("data-status", "planned");
    expect(getRow("req-nqr")).toHaveAttribute("data-status", "missing");
  });

  it("Non-200 CSI row stays 'missing' when only a COLL 200 CSI course is planned", async () => {
    act(() => {
      usePlannerStore.getState().addCourse("year2-fall", makeCourse({
        code: "COLL200C",
        collAttribute: "COLL 200",
        csi: true,
      }));
    });

    expect(getRow("req-csi")).toHaveAttribute("data-status", "missing");
  });

  it("Non-200 ALV row stays 'missing' when only a COLL 200 ALV course is planned", async () => {
    act(() => {
      usePlannerStore.getState().addCourse("year2-fall", makeCourse({
        code: "COLL200A",
        collAttribute: "COLL 200",
        alv: true,
      }));
    });

    expect(getRow("req-alv")).toHaveAttribute("data-status", "missing");
  });

  it("adding a course with no relevant flags changes no requirement rows", async () => {
    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: "CSCI141",
        collAttribute: null,
        nqr: false,
        csi: false,
        alv: false,
      }));
    });

    for (const id of [
      "req-coll-100", "req-coll-150",
      "req-coll-200-nqr", "req-coll-200-csi", "req-coll-200-alv",
      "req-coll-300", "req-coll-350", "req-coll-500",
      "req-nqr", "req-csi", "req-alv",
      "req-lang-prof", "req-arts-prof",
    ]) {
      expect(getRow(id)).toHaveAttribute("data-status", "missing");
    }
  });
});

// ===========================================================================
// 4. REAL-TIME UPDATES
// ===========================================================================

describe("RequirementTracker – real-time updates", () => {
  beforeEach(async () => {
    render(<RequirementTracker />);
    await openTracker();
  });

  it("COLL 100 row updates to 'planned' when a COLL 100 course is added to the store", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: "GOVT175",
        collAttribute: "COLL 100",
      }));
    });

    expect(getRow("req-coll-100")).toHaveAttribute("data-status", "planned");
  });

  it("COLL 150 row updates to 'planned' when a COLL 150 course is added", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year1-spring", makeCourse({
        code: "ENGL150",
        collAttribute: "COLL 150",
      }));
    });

    expect(getRow("req-coll-150")).toHaveAttribute("data-status", "planned");
  });

  it("COLL 300 row updates independently of other COLL rows", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year3-fall", makeCourse({
        code: "HIST300",
        collAttribute: "COLL 300",
      }));
    });

    expect(getRow("req-coll-300")).toHaveAttribute("data-status", "planned");
    expect(getRow("req-coll-350")).toHaveAttribute("data-status", "missing");
    expect(getRow("req-coll-500")).toHaveAttribute("data-status", "missing");
  });

  it("COLL 350 row updates independently of COLL 300", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year3-spring", makeCourse({
        code: "BIOL350",
        collAttribute: "COLL 350",
      }));
    });

    expect(getRow("req-coll-350")).toHaveAttribute("data-status", "planned");
    expect(getRow("req-coll-300")).toHaveAttribute("data-status", "missing");
  });

  it("COLL 500 row updates when a COLL 500 course is added", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year4-spring", makeCourse({
        code: "CSCI491",
        collAttribute: "COLL 500",
      }));
    });

    expect(getRow("req-coll-500")).toHaveAttribute("data-status", "planned");
  });

  it("Non-200 NQR row updates when a non-COLL-200 NQR course is added", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: "PHYS101",
        nqr: true,
        collAttribute: null,
      }));
    });

    expect(getRow("req-nqr")).toHaveAttribute("data-status", "planned");
    // The COLL 200 NQR requirement must remain unmet
    expect(getRow("req-coll-200-nqr")).toHaveAttribute("data-status", "missing");
  });

  it("Non-200 CSI row updates when a non-COLL-200 CSI course is added", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year2-spring", makeCourse({
        code: "SOCL201",
        csi: true,
        collAttribute: "COLL 150", // has a COLL attr, but not COLL 200
      }));
    });

    expect(getRow("req-csi")).toHaveAttribute("data-status", "planned");
    expect(getRow("req-coll-200-csi")).toHaveAttribute("data-status", "missing");
  });

  it("Non-200 ALV row updates when a non-COLL-200 ALV course is added", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year1-spring", makeCourse({
        code: "MUSC101",
        alv: true,
        collAttribute: null,
      }));
    });

    expect(getRow("req-alv")).toHaveAttribute("data-status", "planned");
    expect(getRow("req-coll-200-alv")).toHaveAttribute("data-status", "missing");
  });

  it("Language Proficiency row updates when a langProf course is added", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: "SPAN201",
        langProf: true,
      }));
    });

    expect(getRow("req-lang-prof")).toHaveAttribute("data-status", "planned");
  });

  it("Arts Proficiency row updates when an artsProf course is added", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year1-spring", makeCourse({
        code: "ARTH101",
        artsProf: true,
      }));
    });

    expect(getRow("req-arts-prof")).toHaveAttribute("data-status", "planned");
  });

  it("row reverts to 'missing' when the satisfying course is removed from the planner", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: "GOVT175",
        collAttribute: "COLL 100",
      }));
    });

    expect(getRow("req-coll-100")).toHaveAttribute("data-status", "planned");

    act(() => {
      usePlannerStore.getState().removeCourse("year1-fall", "GOVT175");
    });

    expect(getRow("req-coll-100")).toHaveAttribute("data-status", "missing");
  });

  it("placing a course in any semester (not just semester 1) satisfies the requirement", () => {
    act(() => {
      usePlannerStore.getState().addCourse("year4-spring", makeCourse({
        code: "GOVT175",
        collAttribute: "COLL 100",
      }));
    });

    expect(getRow("req-coll-100")).toHaveAttribute("data-status", "planned");
  });
});

// ===========================================================================
// 5. COMPLETED STATUS (green) — via props
// ===========================================================================

describe("RequirementTracker – completed status (green)", () => {
  it("marks COLL 100 as 'completed' when a COLL 100 course is in completedCourses", async () => {
    const completed = [makeCourse({ code: "GOVT175", collAttribute: "COLL 100" })];
    render(<RequirementTracker completedCourses={completed} />);
    await openTracker();

    expect(getRow("req-coll-100")).toHaveAttribute("data-status", "completed");
  });

  it("marks COLL 200 NQR as 'completed' via completedCourses", async () => {
    const completed = [makeCourse({ code: "COLL200N", collAttribute: "COLL 200", nqr: true })];
    render(<RequirementTracker completedCourses={completed} />);
    await openTracker();

    expect(getRow("req-coll-200-nqr")).toHaveAttribute("data-status", "completed");
    expect(getRow("req-coll-200-csi")).toHaveAttribute("data-status", "missing");
  });

  it("marks Non-200 NQR as 'completed' via completedCourses", async () => {
    const completed = [makeCourse({ code: "PHYS101", nqr: true, collAttribute: null })];
    render(<RequirementTracker completedCourses={completed} />);
    await openTracker();

    expect(getRow("req-nqr")).toHaveAttribute("data-status", "completed");
    expect(getRow("req-coll-200-nqr")).toHaveAttribute("data-status", "missing");
  });

  it("marks Language Proficiency as 'completed' via completedCourses", async () => {
    const completed = [makeCourse({ code: "FREN201", langProf: true })];
    render(<RequirementTracker completedCourses={completed} />);
    await openTracker();

    expect(getRow("req-lang-prof")).toHaveAttribute("data-status", "completed");
  });

  it("marks requirements as 'completed' via transferCourses prop", async () => {
    const transfer = [makeCourse({ code: "AP-LANG", langProf: true })];
    render(<RequirementTracker transferCourses={transfer} />);
    await openTracker();

    expect(getRow("req-lang-prof")).toHaveAttribute("data-status", "completed");
  });

  it("'completed' status wins over 'planned' when the same course appears in both", async () => {
    // Course is in planner store AND in completedCourses — completed wins
    const completed = [makeCourse({ code: "GOVT175", collAttribute: "COLL 100" })];
    render(<RequirementTracker completedCourses={completed} />);
    await openTracker();

    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: "GOVT175",
        collAttribute: "COLL 100",
      }));
    });

    expect(getRow("req-coll-100")).toHaveAttribute("data-status", "completed");
  });

  it("both completedCourses and transferCourses satisfy requirements independently", async () => {
    const completed = [makeCourse({ code: "GOVT175", collAttribute: "COLL 100" })];
    const transfer  = [makeCourse({ code: "AP-LANG", langProf: true })];
    render(<RequirementTracker completedCourses={completed} transferCourses={transfer} />);
    await openTracker();

    expect(getRow("req-coll-100")).toHaveAttribute("data-status", "completed");
    expect(getRow("req-lang-prof")).toHaveAttribute("data-status", "completed");
  });

  it("Arts Proficiency completed via transferCourses (AP Art credit)", async () => {
    const transfer = [makeCourse({ code: "AP-ART", artsProf: true })];
    render(<RequirementTracker transferCourses={transfer} />);
    await openTracker();

    expect(getRow("req-arts-prof")).toHaveAttribute("data-status", "completed");
  });
});

// ===========================================================================
// 6. CREDIT PROGRESS
// ===========================================================================

describe("RequirementTracker – credit progress", () => {
  it("shows a credit progress bar when expanded", async () => {
    render(<RequirementTracker />);
    await openTracker();
    expect(screen.getByRole("progressbar", { name: /credit/i })).toBeInTheDocument();
  });

  it("shows 0 / 120 credits when the planner is empty and no completed courses", async () => {
    render(<RequirementTracker />);
    await openTracker();

    const bar = screen.getByRole("progressbar", { name: /credit/i });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "120");
    expect(screen.getByText(/0\s*\/\s*120/)).toBeInTheDocument();
  });

  it("counts credits from planned courses in the store", async () => {
    render(<RequirementTracker />);
    await openTracker();

    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({ code: "A", credits: 4 }));
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({ code: "B", credits: 3 }));
    });

    const bar = screen.getByRole("progressbar", { name: /credit/i });
    expect(bar).toHaveAttribute("aria-valuenow", "7");
    expect(screen.getByText(/7\s*\/\s*120/)).toBeInTheDocument();
  });

  it("counts credits from completedCourses prop", async () => {
    const completed = [
      makeCourse({ code: "X", credits: 4 }),
      makeCourse({ code: "Y", credits: 3 }),
    ];
    render(<RequirementTracker completedCourses={completed} />);
    await openTracker();

    expect(screen.getByRole("progressbar", { name: /credit/i }))
      .toHaveAttribute("aria-valuenow", "7");
  });

  it("counts credits from transferCourses prop", async () => {
    const transfer = [makeCourse({ code: "AP-1", credits: 4 })];
    render(<RequirementTracker transferCourses={transfer} />);
    await openTracker();

    expect(screen.getByRole("progressbar", { name: /credit/i }))
      .toHaveAttribute("aria-valuenow", "4");
  });

  it("sums credits across planner, completedCourses, and transferCourses (de-duped by code)", async () => {
    // "GOVT175" is in both planner and completedCourses — should only be counted once
    const completed = [makeCourse({ code: "GOVT175", credits: 4, collAttribute: "COLL 100" })];
    const transfer  = [makeCourse({ code: "AP-LANG", credits: 4, langProf: true })];
    render(<RequirementTracker completedCourses={completed} transferCourses={transfer} />);
    await openTracker();

    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: "GOVT175", credits: 4, collAttribute: "COLL 100",
      }));
      usePlannerStore.getState().addCourse("year1-spring", makeCourse({
        code: "CSCI141", credits: 4,
      }));
    });

    // GOVT175 (4) counted once + AP-LANG (4) + CSCI141 (4) = 12
    expect(screen.getByRole("progressbar", { name: /credit/i }))
      .toHaveAttribute("aria-valuenow", "12");
    expect(screen.getByText(/12\s*\/\s*120/)).toBeInTheDocument();
  });

  it("updates credit total in real time when courses are added to the planner", async () => {
    render(<RequirementTracker />);
    await openTracker();

    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({ code: "C1", credits: 4 }));
    });

    expect(screen.getByRole("progressbar", { name: /credit/i }))
      .toHaveAttribute("aria-valuenow", "4");

    act(() => {
      usePlannerStore.getState().addCourse("year2-fall", makeCourse({ code: "C2", credits: 3 }));
    });

    expect(screen.getByRole("progressbar", { name: /credit/i }))
      .toHaveAttribute("aria-valuenow", "7");
  });

  it("updates credit total in real time when courses are removed from the planner", async () => {
    render(<RequirementTracker />);
    await openTracker();

    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({ code: "C1", credits: 4 }));
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({ code: "C2", credits: 3 }));
    });

    act(() => {
      usePlannerStore.getState().removeCourse("year1-fall", "C2");
    });

    expect(screen.getByRole("progressbar", { name: /credit/i }))
      .toHaveAttribute("aria-valuenow", "4");
    expect(screen.getByText(/4\s*\/\s*120/)).toBeInTheDocument();
  });

  it("credits from all semesters are summed (not just semester 1)", async () => {
    render(<RequirementTracker />);
    await openTracker();

    act(() => {
      usePlannerStore.getState().addCourse("year1-fall",   makeCourse({ code: "A", credits: 3 }));
      usePlannerStore.getState().addCourse("year2-spring", makeCourse({ code: "B", credits: 4 }));
      usePlannerStore.getState().addCourse("year4-spring", makeCourse({ code: "C", credits: 3 }));
    });

    expect(screen.getByRole("progressbar", { name: /credit/i }))
      .toHaveAttribute("aria-valuenow", "10");
  });

  it("shows a visual 'met' indicator when total credits reach 120", async () => {
    // 40 courses × 3 credits = 120 — use completedCourses to avoid polluting store
    const completed = Array.from({ length: 40 }, (_, i) =>
      makeCourse({ code: `CRS${i}`, credits: 3 })
    );
    render(<RequirementTracker completedCourses={completed} />);
    await openTracker();

    expect(screen.getByRole("progressbar", { name: /credit/i }))
      .toHaveAttribute("aria-valuenow", "120");
    // The credit row itself signals completion
    expect(getRow("req-credits")).toHaveAttribute("data-status", "completed");
  });

  it("credit row shows 'planned' (not completed) when total is from planner only", async () => {
    render(<RequirementTracker />);
    await openTracker();

    // Simulate 120 credits in planner (not in completedCourses)
    act(() => {
      Array.from({ length: 40 }, (_, i) =>
        usePlannerStore.getState().addCourse(
          i < 20 ? "year1-fall" : "year2-fall",
          makeCourse({ code: `P${i}`, credits: 3 })
        )
      );
    });

    // Even at 120, if the credits are only "planned" the row should not be "completed"
    expect(getRow("req-credits")).toHaveAttribute("data-status", "planned");
  });
});
