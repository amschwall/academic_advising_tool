// file: tests/what-if.test.tsx

/**
 * Phase 16 — What-If Analysis: UI components
 *
 * Tests for:
 *   components/WhatIfModal.tsx      — modal for selecting major/minor/concentration
 *   components/RequirementTracker.tsx — updated to show major requirements + what-if state
 *
 * New data files:
 *   lib/data/majors.ts              — static W&M major/minor/concentration list
 *   lib/stores/whatIfStore.ts       — ephemeral what-if Zustand store
 *
 * Schema changes (prisma/schema.prisma):
 *   Student.minor: String?
 *   Student.concentration: String?
 *
 * Design decisions reflected here:
 *   - WhatIfModal is opened by a "What-If Analysis" button inside RequirementTracker
 *   - WhatIfModal reads/writes useWhatIfStore directly; takes declaredMajor as prop for display
 *   - RequirementTracker takes declaredMajor?: string (default "Undecided")
 *   - Major requirements appear in a SEPARATE section from COLL/gen-ed requirements
 *   - When what-if is active: merged view = declared major reqs + what-if additions
 *   - When no requirements are defined for a program: that section is hidden
 *   - Major course requirements: data-testid="req-major-course-{CODE}"
 *   - Major credit requirements: data-testid="req-major-credits-{index}"
 *   - Minor course requirements: data-testid="req-minor-course-{CODE}"
 *   - Minor credit requirements: data-testid="req-minor-credits-{index}"
 *   - What-if active banner: data-testid="what-if-banner"
 *   - PlannedCourse gains optional department?: string for credit requirement matching
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WhatIfModal }        from "@/components/WhatIfModal";
import { RequirementTracker } from "@/components/RequirementTracker";
import { useWhatIfStore }     from "@/lib/stores/whatIfStore";
import { usePlannerStore, type PlannedCourse } from "@/lib/stores/plannerStore";
import { MAJORS, MINORS, CONCENTRATIONS } from "@/lib/data/majors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    department: "TEST",
    ...overrides,
  };
}

/** Open the RequirementTracker panel and the What-If modal in sequence. */
async function openTrackerAndModal() {
  await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
  await userEvent.click(screen.getByRole("button", { name: /what.?if analysis/i }));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  usePlannerStore.getState().reset();
  useWhatIfStore.getState().reset();
});

// ===========================================================================
// A. STATIC MAJOR DATA — lib/data/majors.ts
// ===========================================================================

describe("lib/data/majors – static list structure", () => {
  it("MAJORS is a non-empty array", () => {
    expect(Array.isArray(MAJORS)).toBe(true);
    expect(MAJORS.length).toBeGreaterThan(0);
  });

  it("MINORS is a non-empty array", () => {
    expect(Array.isArray(MINORS)).toBe(true);
    expect(MINORS.length).toBeGreaterThan(0);
  });

  it("CONCENTRATIONS is a non-empty array", () => {
    expect(Array.isArray(CONCENTRATIONS)).toBe(true);
    expect(CONCENTRATIONS.length).toBeGreaterThan(0);
  });

  it("each major has a name, type='major', and requirements array", () => {
    for (const m of MAJORS) {
      expect(m.name).toBeTruthy();
      expect(m.type).toBe("major");
      expect(Array.isArray(m.requirements)).toBe(true);
    }
  });

  it("each minor has a name, type='minor', and requirements array", () => {
    for (const m of MINORS) {
      expect(m.name).toBeTruthy();
      expect(m.type).toBe("minor");
      expect(Array.isArray(m.requirements)).toBe(true);
    }
  });

  it("includes 'Computer Science' as a major", () => {
    expect(MAJORS.some((m) => m.name === "Computer Science")).toBe(true);
  });

  it("includes 'History' as a minor", () => {
    expect(MINORS.some((m) => m.name === "History")).toBe(true);
  });

  it("Computer Science major has at least one course requirement", () => {
    const cs = MAJORS.find((m) => m.name === "Computer Science")!;
    expect(cs.requirements.some((r) => r.type === "course")).toBe(true);
  });

  it("Computer Science major has at least one credit requirement", () => {
    const cs = MAJORS.find((m) => m.name === "Computer Science")!;
    expect(cs.requirements.some((r) => r.type === "credits")).toBe(true);
  });

  it("History minor has at least one credit requirement", () => {
    const hist = MINORS.find((m) => m.name === "History")!;
    expect(hist.requirements.some((r) => r.type === "credits")).toBe(true);
  });
});

// ===========================================================================
// B. WhatIfModal — RENDER
// ===========================================================================

describe("WhatIfModal – render", () => {
  it("is not in the DOM when store.open is false", () => {
    render(<WhatIfModal declaredMajor="Undecided" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders a dialog when store.open is true", () => {
    act(() => { useWhatIfStore.getState().openModal(); });
    render(<WhatIfModal declaredMajor="Undecided" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the title 'What-If Analysis'", () => {
    act(() => { useWhatIfStore.getState().openModal(); });
    render(<WhatIfModal declaredMajor="Undecided" />);
    expect(screen.getByText(/what.?if analysis/i)).toBeInTheDocument();
  });

  it("shows the student's declared major", () => {
    act(() => { useWhatIfStore.getState().openModal(); });
    render(<WhatIfModal declaredMajor="Computer Science" />);
    // "Your declared major: Computer Science" — scoped to avoid matching dropdown options
    expect(screen.getByText(/your declared major/i)).toBeInTheDocument();
  });

  it("shows 'Undecided' when declared major is not set", () => {
    act(() => { useWhatIfStore.getState().openModal(); });
    render(<WhatIfModal declaredMajor="Undecided" />);
    expect(screen.getByText(/undecided/i)).toBeInTheDocument();
  });
});

// ===========================================================================
// C. WhatIfModal — DROPDOWNS
// ===========================================================================

describe("WhatIfModal – major/minor/concentration dropdowns", () => {
  beforeEach(() => {
    act(() => { useWhatIfStore.getState().openModal(); });
    render(<WhatIfModal declaredMajor="Undecided" />);
  });

  it("shows a major selection dropdown", () => {
    expect(screen.getByRole("combobox", { name: /major/i })).toBeInTheDocument();
  });

  it("major dropdown contains 'Computer Science'", () => {
    const select = screen.getByRole("combobox", { name: /major/i });
    expect(within(select).getByRole("option", { name: /computer science/i })).toBeInTheDocument();
  });

  it("major dropdown contains all entries from MAJORS", () => {
    const select = screen.getByRole("combobox", { name: /major/i });
    for (const m of MAJORS) {
      expect(within(select).getByRole("option", { name: m.name })).toBeInTheDocument();
    }
  });

  it("shows a minor selection dropdown", () => {
    expect(screen.getByRole("combobox", { name: /minor/i })).toBeInTheDocument();
  });

  it("minor dropdown includes a 'None' option", () => {
    const select = screen.getByRole("combobox", { name: /minor/i });
    expect(within(select).getByRole("option", { name: /none/i })).toBeInTheDocument();
  });

  it("minor dropdown contains 'History'", () => {
    const select = screen.getByRole("combobox", { name: /minor/i });
    expect(within(select).getByRole("option", { name: /history/i })).toBeInTheDocument();
  });

  it("minor dropdown contains all entries from MINORS", () => {
    const select = screen.getByRole("combobox", { name: /minor/i });
    for (const m of MINORS) {
      expect(within(select).getByRole("option", { name: m.name })).toBeInTheDocument();
    }
  });

  it("shows a concentration selection dropdown", () => {
    expect(screen.getByRole("combobox", { name: /concentration/i })).toBeInTheDocument();
  });

  it("concentration dropdown includes a 'None' option", () => {
    const select = screen.getByRole("combobox", { name: /concentration/i });
    expect(within(select).getByRole("option", { name: /none/i })).toBeInTheDocument();
  });
});

// ===========================================================================
// D. WhatIfModal — SELECTIONS UPDATE THE STORE
// ===========================================================================

describe("WhatIfModal – selecting options updates the store", () => {
  beforeEach(() => {
    act(() => { useWhatIfStore.getState().openModal(); });
    render(<WhatIfModal declaredMajor="Undecided" />);
  });

  it("selecting a major from the dropdown updates store.major", async () => {
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /major/i }),
      "Computer Science",
    );
    expect(useWhatIfStore.getState().major).toBe("Computer Science");
  });

  it("selecting a minor from the dropdown updates store.minor", async () => {
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /minor/i }),
      "History",
    );
    expect(useWhatIfStore.getState().minor).toBe("History");
  });

  it("selecting 'None' for minor sets store.minor to null", async () => {
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /minor/i }),
      "History",
    );
    // selectOptions requires an exact string, not a regex
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /minor/i }),
      "None",
    );
    expect(useWhatIfStore.getState().minor).toBeNull();
  });

  it("selecting a concentration from the dropdown updates store.concentration", async () => {
    const concentrationSelect = screen.getByRole("combobox", { name: /concentration/i });
    const firstConcentration = CONCENTRATIONS[0];
    await userEvent.selectOptions(concentrationSelect, firstConcentration.name);
    expect(useWhatIfStore.getState().concentration).toBe(firstConcentration.name);
  });
});

// ===========================================================================
// E. WhatIfModal — RUN ANALYSIS AND CANCEL BUTTONS
// ===========================================================================

describe("WhatIfModal – Run Analysis button", () => {
  beforeEach(() => {
    act(() => { useWhatIfStore.getState().openModal(); });
    render(<WhatIfModal declaredMajor="Undecided" />);
  });

  it("has a 'Run Analysis' button", () => {
    expect(screen.getByRole("button", { name: /run analysis/i })).toBeInTheDocument();
  });

  it("'Run Analysis' sets store.active to true", async () => {
    await userEvent.click(screen.getByRole("button", { name: /run analysis/i }));
    expect(useWhatIfStore.getState().active).toBe(true);
  });

  it("'Run Analysis' closes the modal (store.open becomes false)", async () => {
    await userEvent.click(screen.getByRole("button", { name: /run analysis/i }));
    expect(useWhatIfStore.getState().open).toBe(false);
  });

  it("'Run Analysis' preserves selections made in this session", async () => {
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /major/i }),
      "Computer Science",
    );
    await userEvent.click(screen.getByRole("button", { name: /run analysis/i }));
    expect(useWhatIfStore.getState().major).toBe("Computer Science");
  });
});

describe("WhatIfModal – Cancel button", () => {
  it("has a 'Cancel' button", () => {
    act(() => { useWhatIfStore.getState().openModal(); });
    render(<WhatIfModal declaredMajor="Undecided" />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("'Cancel' closes the modal (store.open becomes false)", async () => {
    act(() => { useWhatIfStore.getState().openModal(); });
    render(<WhatIfModal declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(useWhatIfStore.getState().open).toBe(false);
  });

  it("'Cancel' does not activate the analysis", async () => {
    act(() => { useWhatIfStore.getState().openModal(); });
    render(<WhatIfModal declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(useWhatIfStore.getState().active).toBe(false);
  });
});

// ===========================================================================
// F. WhatIfModal — CLEAR ANALYSIS (when already active)
// ===========================================================================

describe("WhatIfModal – Clear Analysis (when analysis is already active)", () => {
  beforeEach(() => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().activate();
      useWhatIfStore.getState().openModal();
    });
    render(<WhatIfModal declaredMajor="Undecided" />);
  });

  it("shows a 'Clear Analysis' button when an analysis is active", () => {
    expect(screen.getByRole("button", { name: /clear analysis/i })).toBeInTheDocument();
  });

  it("'Clear Analysis' sets store.active to false", async () => {
    await userEvent.click(screen.getByRole("button", { name: /clear analysis/i }));
    expect(useWhatIfStore.getState().active).toBe(false);
  });

  it("'Clear Analysis' clears store.major", async () => {
    await userEvent.click(screen.getByRole("button", { name: /clear analysis/i }));
    expect(useWhatIfStore.getState().major).toBeNull();
  });

  it("'Clear Analysis' closes the modal", async () => {
    await userEvent.click(screen.getByRole("button", { name: /clear analysis/i }));
    expect(useWhatIfStore.getState().open).toBe(false);
  });
});

// ===========================================================================
// G. RequirementTracker — WHAT-IF ANALYSIS BUTTON
// ===========================================================================

describe("RequirementTracker – What-If Analysis button", () => {
  it("renders a 'What-If Analysis' button", () => {
    render(<RequirementTracker />);
    expect(screen.getByRole("button", { name: /what.?if analysis/i })).toBeInTheDocument();
  });

  it("clicking 'What-If Analysis' sets store.open to true", async () => {
    render(<RequirementTracker />);
    await userEvent.click(screen.getByRole("button", { name: /what.?if analysis/i }));
    expect(useWhatIfStore.getState().open).toBe(true);
  });

  it("the WhatIfModal appears after clicking the button", async () => {
    render(<RequirementTracker />);
    await userEvent.click(screen.getByRole("button", { name: /what.?if analysis/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

// ===========================================================================
// H. RequirementTracker — WHAT-IF ACTIVE BANNER
// ===========================================================================

describe("RequirementTracker – what-if active banner", () => {
  it("no what-if banner when analysis is not active", async () => {
    render(<RequirementTracker />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.queryByTestId("what-if-banner")).not.toBeInTheDocument();
  });

  it("banner appears when what-if is active", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.getByTestId("what-if-banner")).toBeInTheDocument();
  });

  it("banner includes the what-if major name", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(within(screen.getByTestId("what-if-banner")).getByText(/computer science/i)).toBeInTheDocument();
  });

  it("banner includes the what-if minor name when set", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().setMinor("History");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(within(screen.getByTestId("what-if-banner")).getByText(/history/i)).toBeInTheDocument();
  });

  it("banner has a button to stop / clear the analysis", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(
      within(screen.getByTestId("what-if-banner"))
        .getByRole("button", { name: /clear|stop|end/i })
    ).toBeInTheDocument();
  });

  it("clicking the banner clear button deactivates the analysis", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    await userEvent.click(
      within(screen.getByTestId("what-if-banner"))
        .getByRole("button", { name: /clear|stop|end/i })
    );
    expect(useWhatIfStore.getState().active).toBe(false);
  });
});

// ===========================================================================
// I. RequirementTracker — DECLARED MAJOR REQUIREMENTS (no what-if)
// ===========================================================================

describe("RequirementTracker – declared major requirements (what-if inactive)", () => {
  it("shows no major requirements section when declaredMajor is 'Undecided'", async () => {
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.queryByTestId("major-requirements-section")).not.toBeInTheDocument();
  });

  it("shows a major requirements section when declaredMajor is 'Computer Science'", async () => {
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.getByTestId("major-requirements-section")).toBeInTheDocument();
  });

  it("major requirements section is labeled with the declared major name", async () => {
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(
      within(screen.getByTestId("major-requirements-section"))
        .getByText(/computer science/i)
    ).toBeInTheDocument();
  });

  it("shows course requirement rows for each required course in the declared major", async () => {
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    const cs = MAJORS.find((m) => m.name === "Computer Science")!;
    const courseReqs = cs.requirements.filter((r) => r.type === "course");

    for (const req of courseReqs) {
      expect(
        screen.getByTestId(`req-major-course-${req.code}`)
      ).toBeInTheDocument();
    }
  });

  it("shows credit requirement rows for each credit threshold in the declared major", async () => {
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    const cs = MAJORS.find((m) => m.name === "Computer Science")!;
    const creditReqs = cs.requirements.filter((r) => r.type === "credits");

    for (let i = 0; i < creditReqs.length; i++) {
      expect(screen.getByTestId(`req-major-credits-${i}`)).toBeInTheDocument();
    }
  });

  it("course requirement rows default to 'missing' status when planner is empty", async () => {
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    const cs = MAJORS.find((m) => m.name === "Computer Science")!;
    const courseReqs = cs.requirements.filter((r) => r.type === "course");

    for (const req of courseReqs) {
      expect(screen.getByTestId(`req-major-course-${req.code}`))
        .toHaveAttribute("data-status", "missing");
    }
  });
});

// ===========================================================================
// J. RequirementTracker — MAJOR COURSE REQUIREMENT STATUS (real-time)
// ===========================================================================

describe("RequirementTracker – major course requirement status", () => {
  // Use the first course requirement from Computer Science as the test target
  const cs = MAJORS.find((m) => m.name === "Computer Science")!;
  const firstCourseReq = cs.requirements.find((r) => r.type === "course") as
    { type: "course"; code: string; title: string; credits: number };

  it("shows 'planned' when the required course is added to the planner", async () => {
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: firstCourseReq.code,
        credits: firstCourseReq.credits,
        department: firstCourseReq.code.replace(/\d+$/, "").trim(),
      }));
    });

    expect(screen.getByTestId(`req-major-course-${firstCourseReq.code}`))
      .toHaveAttribute("data-status", "planned");
  });

  it("shows 'completed' when the required course is in completedCourses prop", async () => {
    const completed = [makeCourse({
      code: firstCourseReq.code,
      credits: firstCourseReq.credits,
    })];
    render(<RequirementTracker declaredMajor="Computer Science" completedCourses={completed} />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    expect(screen.getByTestId(`req-major-course-${firstCourseReq.code}`))
      .toHaveAttribute("data-status", "completed");
  });

  it("reverts to 'missing' when the planned course is removed from the planner", async () => {
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: firstCourseReq.code,
        credits: firstCourseReq.credits,
      }));
    });
    act(() => {
      usePlannerStore.getState().removeCourse("year1-fall", firstCourseReq.code);
    });

    expect(screen.getByTestId(`req-major-course-${firstCourseReq.code}`))
      .toHaveAttribute("data-status", "missing");
  });

  it("'completed' wins over 'planned' for course requirements", async () => {
    const completed = [makeCourse({ code: firstCourseReq.code, credits: firstCourseReq.credits })];
    render(<RequirementTracker declaredMajor="Computer Science" completedCourses={completed} />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    act(() => {
      usePlannerStore.getState().addCourse("year1-fall", makeCourse({
        code: firstCourseReq.code,
        credits: firstCourseReq.credits,
      }));
    });

    expect(screen.getByTestId(`req-major-course-${firstCourseReq.code}`))
      .toHaveAttribute("data-status", "completed");
  });
});

// ===========================================================================
// K. RequirementTracker — MAJOR CREDIT REQUIREMENT STATUS
// ===========================================================================

describe("RequirementTracker – major credit requirement status", () => {
  const cs = MAJORS.find((m) => m.name === "Computer Science")!;
  const creditReqs = cs.requirements.filter((r) => r.type === "credits") as
    { type: "credits"; description: string; credits: number; departments?: string[]; minLevel?: number }[];

  it("credit requirement row shows 'missing' when no qualifying courses are planned", async () => {
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.getByTestId("req-major-credits-0")).toHaveAttribute("data-status", "missing");
  });

  it("credit requirement row shows progress text (X / N cr)", async () => {
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    const row = screen.getByTestId("req-major-credits-0");
    expect(row).toHaveTextContent(`0 / ${creditReqs[0].credits}`);
  });

  it("credit requirement row shows 'planned' when enough qualifying credits are in the planner", async () => {
    const req = creditReqs[0];
    const dept = req.departments?.[0] ?? "CSCI";
    const level = req.minLevel ?? 300;
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    // Add enough courses to meet the credit threshold
    const coursesNeeded = Math.ceil(req.credits / 3);
    act(() => {
      for (let i = 0; i < coursesNeeded; i++) {
        usePlannerStore.getState().addCourse("year3-fall", makeCourse({
          code: `${dept}${level + i}`,
          credits: 3,
          department: dept,
        }));
      }
    });

    expect(screen.getByTestId("req-major-credits-0")).toHaveAttribute("data-status", "planned");
  });

  it("credit requirement row shows 'completed' when qualifying completed credits meet the threshold", async () => {
    const req = creditReqs[0];
    const dept = req.departments?.[0] ?? "CSCI";
    const level = req.minLevel ?? 300;

    const completed = Array.from({ length: Math.ceil(req.credits / 3) }, (_, i) =>
      makeCourse({ code: `${dept}${level + i}`, credits: 3, department: dept })
    );

    render(
      <RequirementTracker declaredMajor="Computer Science" completedCourses={completed} />
    );
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    expect(screen.getByTestId("req-major-credits-0")).toHaveAttribute("data-status", "completed");
  });

  it("credit requirement does not count courses below the minimum level", async () => {
    const req = creditReqs[0];
    const dept = req.departments?.[0] ?? "CSCI";
    const level = req.minLevel ?? 300;

    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    // Add courses BELOW the min level — these should not count
    const coursesNeeded = Math.ceil(req.credits / 3);
    act(() => {
      for (let i = 0; i < coursesNeeded; i++) {
        usePlannerStore.getState().addCourse("year1-fall", makeCourse({
          code: `${dept}${level - 100 + i}`, // e.g., CSCI201 for a 300-level threshold
          credits: 3,
          department: dept,
        }));
      }
    });

    expect(screen.getByTestId("req-major-credits-0")).toHaveAttribute("data-status", "missing");
  });
});

// ===========================================================================
// L. RequirementTracker — WHAT-IF MAJOR REQUIREMENTS
// ===========================================================================

describe("RequirementTracker – what-if major requirements", () => {
  it("shows major requirements section when what-if is active with a major", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.getByTestId("major-requirements-section")).toBeInTheDocument();
  });

  it("major section shows the what-if major name", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(
      within(screen.getByTestId("major-requirements-section")).getByText(/computer science/i)
    ).toBeInTheDocument();
  });

  it("hides major requirements section when what-if is inactive (and declared is Undecided)", async () => {
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.queryByTestId("major-requirements-section")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// M. RequirementTracker — MINOR REQUIREMENTS (via what-if)
// ===========================================================================

describe("RequirementTracker – minor requirements via what-if", () => {
  it("shows no minor requirements section when no minor is selected", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.queryByTestId("minor-requirements-section")).not.toBeInTheDocument();
  });

  it("shows a minor requirements section when a minor is selected in what-if", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().setMinor("History");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.getByTestId("minor-requirements-section")).toBeInTheDocument();
  });

  it("minor requirements section is labeled with the minor name", async () => {
    act(() => {
      useWhatIfStore.getState().setMinor("History");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(
      within(screen.getByTestId("minor-requirements-section")).getByText(/history/i)
    ).toBeInTheDocument();
  });

  it("minor credit requirement rows have correct data-testids", async () => {
    act(() => {
      useWhatIfStore.getState().setMinor("History");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    const hist = MINORS.find((m) => m.name === "History")!;
    const creditReqs = hist.requirements.filter((r) => r.type === "credits");
    for (let i = 0; i < creditReqs.length; i++) {
      expect(screen.getByTestId(`req-minor-credits-${i}`)).toBeInTheDocument();
    }
  });

  it("minor credit requirement starts as 'missing'", async () => {
    act(() => {
      useWhatIfStore.getState().setMinor("History");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.getByTestId("req-minor-credits-0")).toHaveAttribute("data-status", "missing");
  });
});

// ===========================================================================
// N. RequirementTracker — MERGED REQUIREMENTS (declared major + what-if)
// ===========================================================================

describe("RequirementTracker – merged requirements (declared + what-if)", () => {
  it("shows both declared major section and what-if minor section when both are set", async () => {
    act(() => {
      useWhatIfStore.getState().setMinor("History");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.getByTestId("major-requirements-section")).toBeInTheDocument();
    expect(screen.getByTestId("minor-requirements-section")).toBeInTheDocument();
  });

  it("COLL requirements always appear alongside major/minor requirements", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    // Core COLL reqs must still be present
    expect(screen.getByTestId("req-coll-100")).toBeInTheDocument();
    expect(screen.getByTestId("req-coll-500")).toBeInTheDocument();
  });

  it("does not duplicate major requirements when declared major equals what-if major", async () => {
    // If student declared CS and runs what-if for CS, only one CS section appears
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Computer Science" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));

    const sections = screen.getAllByTestId("major-requirements-section");
    expect(sections).toHaveLength(1);
  });

  it("shows what-if major requirements AND what-if minor requirements simultaneously", async () => {
    act(() => {
      useWhatIfStore.getState().setMajor("Computer Science");
      useWhatIfStore.getState().setMinor("History");
      useWhatIfStore.getState().activate();
    });
    render(<RequirementTracker declaredMajor="Undecided" />);
    await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
    expect(screen.getByTestId("major-requirements-section")).toBeInTheDocument();
    expect(screen.getByTestId("minor-requirements-section")).toBeInTheDocument();
  });
});

// ===========================================================================
// O. RequirementTracker — PROGRAM WITH NO REQUIREMENTS DEFINED
// ===========================================================================

describe("RequirementTracker – program with no requirements configured", () => {
  it("hides the major section when the what-if major has no requirements", async () => {
    // Find a major that has zero requirements (or use a name not in the list)
    const emptyMajor = MAJORS.find((m) => m.requirements.length === 0);
    if (!emptyMajor) {
      // If all majors have requirements, use a name that isn't in MAJORS
      act(() => {
        useWhatIfStore.getState().setMajor("__nonexistent_major__");
        useWhatIfStore.getState().activate();
      });
      render(<RequirementTracker declaredMajor="Undecided" />);
      await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
      expect(screen.queryByTestId("major-requirements-section")).not.toBeInTheDocument();
    } else {
      act(() => {
        useWhatIfStore.getState().setMajor(emptyMajor.name);
        useWhatIfStore.getState().activate();
      });
      render(<RequirementTracker declaredMajor="Undecided" />);
      await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
      expect(screen.queryByTestId("major-requirements-section")).not.toBeInTheDocument();
    }
  });
});
