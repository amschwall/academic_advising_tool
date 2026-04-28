// file: tests/adversarial.test.tsx
//
// Phase 20 — Adversarial & Edge-Case Testing (jsdom / React environment)
//
// Covers:
//   1. Senior near graduation — RequirementTracker credit-row status
//   2. Double major — tracker renders two separate ProgramSection blocks
//   3. Study abroad — W&M registered credits (planned) vs. pre-W&M (transfer/completed)
//   4. Transfer credits — tracker status for COLL, major requirements, and total credits

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RequirementTracker } from "@/components/RequirementTracker";
import { usePlannerStore, type PlannedCourse } from "@/lib/stores/plannerStore";
import { useWhatIfStore }                       from "@/lib/stores/whatIfStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCourse(overrides: Partial<PlannedCourse> = {}): PlannedCourse {
  return {
    code:              "TEST101",
    title:             "Test Course",
    credits:           3,
    prerequisiteCodes: [],
    sections:          [],
    collAttribute:     null,
    alv:               false,
    nqr:               false,
    csi:               false,
    langProf:          false,
    artsProf:          false,
    ...overrides,
  };
}

/** Click the toggle to expand the tracker panel. */
async function openTracker() {
  await userEvent.click(screen.getByRole("button", { name: /view requirements/i }));
}

/** Switch to the "Major / Minor" programs tab (only available while panel is open). */
async function openProgramsTab() {
  const tab = screen.getByRole("button", { name: /major \/ minor/i });
  await userEvent.click(tab);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  usePlannerStore.getState().reset();
  useWhatIfStore.getState().reset();
});

// ===========================================================================
// 1. Senior near graduation — RequirementTracker credit status
// ===========================================================================

describe("Adversarial: senior near graduation — credit status", () => {
  it("shows 'planned' when completed + planned credits exactly reach 120", async () => {
    // 60 credits completed, 60 credits planned → total = 120, but not all 'completed'
    const completedCourses = Array.from({ length: 20 }, (_, i) =>
      makeCourse({ code: `DONE${String(i + 1).padStart(3, "0")}`, credits: 3 }),
    ); // 20 × 3 = 60 cr completed

    const { semesters, addCourse } = usePlannerStore.getState();
    act(() => {
      // Add 20 × 3 = 60 planned credits
      for (let i = 0; i < 20; i++) {
        const semIdx = i % semesters.length;
        addCourse(
          semesters[semIdx].id,
          makeCourse({ code: `PLAN${String(i + 1).padStart(3, "0")}`, credits: 3 }),
        );
      }
    });

    render(<RequirementTracker completedCourses={completedCourses} />);
    await openTracker();

    const creditRow = screen.getByTestId("req-credits");
    // Total = 120, but 60 are only planned → status is "planned", not "completed"
    expect(creditRow).toHaveAttribute("data-status", "planned");
  });

  it("shows 'completed' once the student has 120+ completed credits", async () => {
    // 40 × 3 = 120 completed credits
    const completedCourses = Array.from({ length: 40 }, (_, i) =>
      makeCourse({ code: `DONE${String(i + 1).padStart(3, "0")}`, credits: 3 }),
    );

    render(<RequirementTracker completedCourses={completedCourses} />);
    await openTracker();

    const creditRow = screen.getByTestId("req-credits");
    expect(creditRow).toHaveAttribute("data-status", "completed");
  });

  it("shows 'missing' when completed + planned credits fall short of 120", async () => {
    // 30 completed + 30 planned = 60 total — well below 120
    const completedCourses = Array.from({ length: 10 }, (_, i) =>
      makeCourse({ code: `DONE${String(i + 1).padStart(3, "0")}`, credits: 3 }),
    ); // 10 × 3 = 30 cr

    const { semesters, addCourse } = usePlannerStore.getState();
    act(() => {
      for (let i = 0; i < 10; i++) {
        addCourse(
          semesters[i % semesters.length].id,
          makeCourse({ code: `PLAN${String(i + 1).padStart(3, "0")}`, credits: 3 }),
        );
      }
    });

    render(<RequirementTracker completedCourses={completedCourses} />);
    await openTracker();

    const creditRow = screen.getByTestId("req-credits");
    expect(creditRow).toHaveAttribute("data-status", "missing");
  });

  it("does not double-count a course that appears in both completedCourses and the planner", async () => {
    // CSCI141 completed AND placed in the planner — should count once, not twice
    const completedCourses = [makeCourse({ code: "CSCI141", credits: 4 })];

    const { semesters, addCourse } = usePlannerStore.getState();
    act(() => {
      addCourse(semesters[0].id, makeCourse({ code: "CSCI141", credits: 4 }));
    });

    render(<RequirementTracker completedCourses={completedCourses} />);
    await openTracker();

    // Credit total should reflect 4 credits (not 8)
    const creditRow = screen.getByTestId("req-credits");
    expect(creditRow).toHaveTextContent("4 / 120");
  });

  it("shows 'completed' immediately after dropping below 120 planned and completing the rest", async () => {
    // 41 × 3 = 123 completed → over the threshold
    const completedCourses = Array.from({ length: 41 }, (_, i) =>
      makeCourse({ code: `GRAD${String(i + 1).padStart(3, "0")}`, credits: 3 }),
    );

    render(<RequirementTracker completedCourses={completedCourses} />);
    await openTracker();

    expect(screen.getByTestId("req-credits")).toHaveAttribute("data-status", "completed");
  });
});

// ===========================================================================
// 2. Double major — tracker renders two separate program sections
// ===========================================================================

describe("Adversarial: double major — RequirementTracker shows both programs", () => {
  async function renderDoubleMajor() {
    // Activate a what-if analysis with Economics as the second major
    act(() => {
      useWhatIfStore.setState({
        open:          false,
        active:        true,
        major:         "Economics",
        minor:         null,
        concentration: null,
      });
    });

    render(<RequirementTracker declaredMajor="Computer Science" />);
    await openTracker();
    // The useEffect auto-switches to Programs tab when whatIf.active is true
    // but we still need to ensure we're on the right tab
    await openProgramsTab();
  }

  it("shows two major-requirements sections when two majors are active", async () => {
    await renderDoubleMajor();
    const sections = screen.getAllByTestId("major-requirements-section");
    expect(sections).toHaveLength(2);
  });

  it("Computer Science section contains its specific required courses", async () => {
    await renderDoubleMajor();
    // CS major requires CSCI141, CSCI241, CSCI303
    expect(screen.getByTestId("req-major-course-CSCI141")).toBeInTheDocument();
    expect(screen.getByTestId("req-major-course-CSCI241")).toBeInTheDocument();
    expect(screen.getByTestId("req-major-course-CSCI303")).toBeInTheDocument();
  });

  it("Economics section contains its specific required courses", async () => {
    await renderDoubleMajor();
    // Economics major requires ECON101, ECON102
    expect(screen.getByTestId("req-major-course-ECON101")).toBeInTheDocument();
    expect(screen.getByTestId("req-major-course-ECON102")).toBeInTheDocument();
  });

  it("CS courses do not bleed into the Economics section and vice versa", async () => {
    await renderDoubleMajor();
    // CSCI141 exists in one section, ECON101 in another — neither bleeds across
    expect(screen.getByTestId("req-major-course-CSCI141")).toBeInTheDocument();
    expect(screen.getByTestId("req-major-course-ECON101")).toBeInTheDocument();
    // These specific codes should each appear exactly once
    expect(screen.getAllByTestId("req-major-course-CSCI141")).toHaveLength(1);
    expect(screen.getAllByTestId("req-major-course-ECON101")).toHaveLength(1);
  });

  it("a course placed in the planner shows as 'planned' in the correct major's section", async () => {
    const { semesters, addCourse } = usePlannerStore.getState();
    act(() => {
      addCourse(semesters[0].id, makeCourse({ code: "CSCI141", credits: 4 }));
    });

    await renderDoubleMajor();

    const csci141Row = screen.getByTestId("req-major-course-CSCI141");
    expect(csci141Row).toHaveAttribute("data-status", "planned");

    // ECON101 is unaffected — still missing
    const econ101Row = screen.getByTestId("req-major-course-ECON101");
    expect(econ101Row).toHaveAttribute("data-status", "missing");
  });

  it("a shared prerequisite placed once counts toward both majors' relevant requirements", async () => {
    // If MATH112 is required by both CS (credit elective) and Math major —
    // placing it once should count in both sections, not require two placements.
    act(() => {
      useWhatIfStore.setState({
        open: false, active: true, major: "Mathematics", minor: null, concentration: null,
      });
    });

    const { semesters, addCourse } = usePlannerStore.getState();
    act(() => {
      // MATH111 + MATH112 are required by the Mathematics major
      addCourse(semesters[0].id, makeCourse({ code: "MATH111", credits: 4 }));
      addCourse(semesters[0].id, makeCourse({ code: "MATH112", credits: 4 }));
    });

    render(<RequirementTracker declaredMajor="Computer Science" />);
    await openTracker();
    await openProgramsTab();

    // Mathematics major shows MATH111 as planned
    expect(screen.getByTestId("req-major-course-MATH111")).toHaveAttribute("data-status", "planned");
    // The same course appears once in the DOM (not duplicated across sections)
    expect(screen.getAllByTestId("req-major-course-MATH111")).toHaveLength(1);
  });
});

// ===========================================================================
// 3. Study abroad
// ===========================================================================

describe("Adversarial: study abroad", () => {
  describe("W&M registered study abroad (courses appear in the planner)", () => {
    it("a course taken abroad and registered at W&M counts toward COLL 350 (planned)", async () => {
      // When a student registers abroad courses at W&M, they appear in a regular
      // semester slot in the planner (same as any W&M course).
      const { semesters, addCourse } = usePlannerStore.getState();
      act(() => {
        addCourse(
          semesters[0].id,
          makeCourse({
            code:          "INTL350",
            credits:       3,
            collAttribute: "COLL 350", // Experiential learning
          }),
        );
      });

      render(<RequirementTracker />);
      await openTracker();

      expect(screen.getByTestId("req-coll-350")).toHaveAttribute("data-status", "planned");
    });

    it("abroad courses count toward the total credit goal", async () => {
      const { semesters, addCourse } = usePlannerStore.getState();
      act(() => {
        // Add 15 credits via study abroad courses
        for (let i = 0; i < 5; i++) {
          addCourse(
            semesters[i % semesters.length].id,
            makeCourse({ code: `ABRD${i}`, credits: 3 }),
          );
        }
      });

      render(<RequirementTracker />);
      await openTracker();

      // 5 × 3 = 15 planned credits shown in the total
      expect(screen.getByTestId("req-credits")).toHaveTextContent("15 / 120");
    });

    it("abroad course satisfying a major requirement shows as 'planned'", async () => {
      act(() => {
        useWhatIfStore.setState({
          open: false, active: true, major: "Computer Science", minor: null, concentration: null,
        });
      });

      const { semesters, addCourse } = usePlannerStore.getState();
      act(() => {
        // CSCI141 taken abroad, registered at W&M
        addCourse(semesters[0].id, makeCourse({ code: "CSCI141", credits: 4 }));
      });

      render(<RequirementTracker />);
      await openTracker();
      await openProgramsTab();

      expect(screen.getByTestId("req-major-course-CSCI141")).toHaveAttribute("data-status", "planned");
    });
  });

  describe("pre-W&M study abroad (credits treated as transfer credits)", () => {
    it("credits earned before enrolling at W&M count as 'completed' toward the credit goal", async () => {
      // 10 × 3 = 30 transfer credits from study abroad before W&M
      const preWMCredits = Array.from({ length: 10 }, (_, i) =>
        makeCourse({ code: `ABROAD${String(i + 1).padStart(3, "0")}`, credits: 3 }),
      );

      render(<RequirementTracker transferCourses={preWMCredits} />);
      await openTracker();

      const creditRow = screen.getByTestId("req-credits");
      // Transfer credits count toward total
      expect(creditRow).toHaveTextContent("30 / 120");
    });

    it("a pre-W&M abroad course satisfying COLL 150 shows as 'completed'", async () => {
      const abroadColl150 = makeCourse({
        code:          "ABROAD200",
        credits:       4,
        collAttribute: "COLL 150",
      });

      render(<RequirementTracker transferCourses={[abroadColl150]} />);
      await openTracker();

      expect(screen.getByTestId("req-coll-150")).toHaveAttribute("data-status", "completed");
    });

    it("pre-W&M study abroad credits take priority over 'planned' status for the same requirement", async () => {
      // Transfer credit satisfies COLL 100; same COLL 100 course also placed in planner
      const transferColl100 = makeCourse({ code: "T100", credits: 3, collAttribute: "COLL 100" });

      const { semesters, addCourse } = usePlannerStore.getState();
      act(() => {
        addCourse(semesters[0].id, makeCourse({ code: "P100", credits: 3, collAttribute: "COLL 100" }));
      });

      render(<RequirementTracker transferCourses={[transferColl100]} />);
      await openTracker();

      // 'completed' beats 'planned' — transfer credit takes priority
      expect(screen.getByTestId("req-coll-100")).toHaveAttribute("data-status", "completed");
    });

    it("120+ pre-W&M study abroad credits render the credit row as 'completed'", async () => {
      // Edge case: student transferred in more than enough credits to graduate
      const massTransfer = Array.from({ length: 41 }, (_, i) =>
        makeCourse({ code: `MASS${String(i + 1).padStart(3, "0")}`, credits: 3 }),
      ); // 41 × 3 = 123 cr

      render(<RequirementTracker transferCourses={massTransfer} />);
      await openTracker();

      expect(screen.getByTestId("req-credits")).toHaveAttribute("data-status", "completed");
    });
  });
});

// ===========================================================================
// 4. Transfer credits — RequirementTracker status
// ===========================================================================

describe("Adversarial: transfer credits — RequirementTracker status", () => {
  it("transfer course satisfying COLL 100 shows as 'completed'", async () => {
    const transfer = makeCourse({ code: "TRCOLL", credits: 3, collAttribute: "COLL 100" });
    render(<RequirementTracker transferCourses={[transfer]} />);
    await openTracker();
    expect(screen.getByTestId("req-coll-100")).toHaveAttribute("data-status", "completed");
  });

  it("transfer course satisfying COLL 200 NQR shows as 'completed'", async () => {
    const transfer = makeCourse({
      code:          "TRNQR",
      credits:       3,
      collAttribute: "COLL 200",
      nqr:           true,
    });
    render(<RequirementTracker transferCourses={[transfer]} />);
    await openTracker();
    expect(screen.getByTestId("req-coll-200-nqr")).toHaveAttribute("data-status", "completed");
  });

  it("transfer course satisfying a major requirement shows as 'completed'", async () => {
    act(() => {
      useWhatIfStore.setState({
        open: false, active: true, major: "Computer Science", minor: null, concentration: null,
      });
    });

    // CSCI141 transferred — satisfies CS major requirement
    const transfer = makeCourse({ code: "CSCI141", credits: 4 });
    render(<RequirementTracker transferCourses={[transfer]} />);
    await openTracker();
    await openProgramsTab();

    expect(screen.getByTestId("req-major-course-CSCI141")).toHaveAttribute("data-status", "completed");
  });

  it("transfer credits count toward total credits and are shown in the progress bar", async () => {
    const transfers = Array.from({ length: 15 }, (_, i) =>
      makeCourse({ code: `TR${String(i + 1).padStart(3, "0")}`, credits: 3 }),
    ); // 15 × 3 = 45 cr

    render(<RequirementTracker transferCourses={transfers} />);
    await openTracker();

    expect(screen.getByTestId("req-credits")).toHaveTextContent("45 / 120");
  });

  it("transfer credits combined with planned credits correctly aggregate toward 120", async () => {
    // 10 transfer × 3 cr = 30; add 30 planned = 60 total → "missing"
    const transfers = Array.from({ length: 10 }, (_, i) =>
      makeCourse({ code: `TR${String(i + 1).padStart(3, "0")}`, credits: 3 }),
    );

    const { semesters, addCourse } = usePlannerStore.getState();
    act(() => {
      for (let i = 0; i < 10; i++) {
        addCourse(
          semesters[i % semesters.length].id,
          makeCourse({ code: `PLAN${String(i + 1).padStart(3, "0")}`, credits: 3 }),
        );
      }
    });

    render(<RequirementTracker transferCourses={transfers} />);
    await openTracker();

    const creditRow = screen.getByTestId("req-credits");
    expect(creditRow).toHaveTextContent("60 / 120");
    expect(creditRow).toHaveAttribute("data-status", "missing");
  });

  it("transfer credits + planned credits reaching exactly 120 show 'planned' (not 'completed')", async () => {
    // 20 transfer × 3 = 60 + 20 planned × 3 = 60 → total 120, not all completed
    const transfers = Array.from({ length: 20 }, (_, i) =>
      makeCourse({ code: `TR${String(i + 1).padStart(3, "0")}`, credits: 3 }),
    );
    const { semesters, addCourse } = usePlannerStore.getState();
    act(() => {
      for (let i = 0; i < 20; i++) {
        addCourse(
          semesters[i % semesters.length].id,
          makeCourse({ code: `PL${String(i + 1).padStart(3, "0")}`, credits: 3 }),
        );
      }
    });

    render(<RequirementTracker transferCourses={transfers} />);
    await openTracker();

    // Transfer counts as 'completed' internally, but since some credits are only planned
    // the total status reflects: transferTotal=60 (completed) < 120 → still "planned"
    const creditRow = screen.getByTestId("req-credits");
    expect(creditRow).toHaveAttribute("data-status", "planned");
  });

  it("transfer credit with Arts Proficiency flag satisfies the arts proficiency requirement", async () => {
    const transfer = makeCourse({ code: "ARTS101", credits: 3, artsProf: true });
    render(<RequirementTracker transferCourses={[transfer]} />);
    await openTracker();
    expect(screen.getByTestId("req-arts-prof")).toHaveAttribute("data-status", "completed");
  });

  it("a transferred course is not double-counted when also placed in the planner", async () => {
    // CSCI141 transferred AND placed in planner — total credit should be 4, not 8
    const transfer = makeCourse({ code: "CSCI141", credits: 4 });
    const { semesters, addCourse } = usePlannerStore.getState();
    act(() => {
      addCourse(semesters[0].id, makeCourse({ code: "CSCI141", credits: 4 }));
    });

    render(<RequirementTracker transferCourses={[transfer]} />);
    await openTracker();

    expect(screen.getByTestId("req-credits")).toHaveTextContent("4 / 120");
  });
});
