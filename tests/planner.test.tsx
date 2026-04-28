// file: tests/planner.test.tsx

/**
 * Phase 14 — Drag-and-Drop Planner
 *
 * Tests for <CoursePlanner availableCourses={...} />
 *
 * Component: components/CoursePlanner.tsx
 * Store:     lib/stores/plannerStore.ts
 *
 * Design decisions reflected in these tests:
 *   - @dnd-kit/core for drag-and-drop
 *   - Default 8 semesters (Year 1–4 × Fall/Spring); student can add/remove
 *   - Invalid drop (blocked): prerequisite not satisfied in an earlier semester
 *   - Warnings only (allowed but flagged): duplicate course, credit overload (>18 cr)
 *   - Remove via ✕ button on placed course card
 *   - Course pool always shows all availableCourses; placed courses get a visual indicator
 *   - Save button (bottom-left) writes to POST /api/schedule — not called on every drop
 *   - Zustand store is in-memory during planning; reset between tests via store.reset()
 *
 * Because jsdom cannot fire PointerEvents, drag simulation works by:
 *   1. Capturing the onDragStart / onDragEnd handlers from <DndContext> props
 *   2. Calling them directly inside act() to simulate a complete drag-and-drop
 * Visual state (isOver, isDragging) is injected via module-level flag objects
 * that the mocked useDraggable / useDroppable hooks read.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";

// ---------------------------------------------------------------------------
// @dnd-kit/core mock
// ---------------------------------------------------------------------------

let triggerDragStart:
  | ((e: { active: { id: string } }) => void)
  | undefined;
let triggerDrop:
  | ((e: { active: { id: string }; over: { id: string } | null }) => void)
  | undefined;

// Inject these before render() to control per-droppable / per-draggable state
const mockIsOver: Record<string, boolean> = {};
const mockIsDragging: Record<string, boolean> = {};

jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragStart, onDragEnd }: any) => {
    triggerDragStart = onDragStart;
    triggerDrop      = onDragEnd;
    return <>{children}</>;
  },
  useDraggable: ({ id }: { id: string }) => ({
    attributes:    { "aria-roledescription": "draggable" },
    listeners:     {},
    setNodeRef:    jest.fn(),
    transform:     null,
    isDragging:    mockIsDragging[id] ?? false,
  }),
  useDroppable: ({ id }: { id: string }) => ({
    setNodeRef: jest.fn(),
    isOver:     mockIsOver[id] ?? false,
  }),
  DragOverlay:   ({ children }: any) => <>{children}</>,
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor:     jest.fn(),
  useSensors:    jest.fn(() => []),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { CoursePlanner } from "@/components/CoursePlanner";
import { usePlannerStore } from "@/lib/stores/plannerStore";

// ---------------------------------------------------------------------------
// Shared types (mirrors the shape from /api/courses/search)
// ---------------------------------------------------------------------------

interface Course {
  code: string;
  title: string;
  credits: number;
  prerequisiteCodes: string[];
  sections: { professor: string; location: string; days: string }[];
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const CSCI141: Course = {
  code: "CSCI141",
  title: "Modern Programming Fundamentals",
  credits: 4,
  prerequisiteCodes: [],
  sections: [],
};

const CSCI301: Course = {
  code: "CSCI301",
  title: "Data Structures",
  credits: 3,
  prerequisiteCodes: ["CSCI141"],
  sections: [],
};

const MATH111: Course = {
  code: "MATH111",
  title: "Calculus I",
  credits: 4,
  prerequisiteCodes: [],
  sections: [],
};

// Heavy course used in credit-overload warning tests
const MUSC499: Course = {
  code: "MUSC499",
  title: "Senior Recital",
  credits: 6,
  prerequisiteCodes: [],
  sections: [],
};

const ALL_COURSES: Course[] = [CSCI141, CSCI301, MATH111, MUSC499];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Simulate dropping courseCode onto a semester column. */
function drop(courseCode: string, semesterId: string) {
  act(() => {
    triggerDrop?.({ active: { id: courseCode }, over: { id: semesterId } });
  });
}

/** Simulate starting a drag on courseCode. */
function startDrag(courseCode: string) {
  act(() => {
    triggerDragStart?.({ active: { id: courseCode } });
  });
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  usePlannerStore.getState().reset();
  mockFetch.mockReset();
  triggerDragStart = undefined;
  triggerDrop      = undefined;
  Object.keys(mockIsOver).forEach((k)    => delete mockIsOver[k]);
  Object.keys(mockIsDragging).forEach((k) => delete mockIsDragging[k]);
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("CoursePlanner — rendering", () => {
  it("renders 8 semester columns by default", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    expect(screen.getAllByRole("region")).toHaveLength(8);
  });

  it("labels the first semester 'Year 1 Fall' and last 'Year 4 Spring'", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    expect(screen.getByText(/year 1.*fall/i)).toBeInTheDocument();
    expect(screen.getByText(/year 4.*spring/i)).toBeInTheDocument();
  });

  it("renders all available courses in the course pool", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    const pool = screen.getByTestId("course-pool");
    expect(within(pool).getByText("Modern Programming Fundamentals")).toBeInTheDocument();
    expect(within(pool).getByText("Data Structures")).toBeInTheDocument();
    expect(within(pool).getByText("Calculus I")).toBeInTheDocument();
  });

  it("renders a Save button", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("renders an 'Add Semester' button", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    expect(screen.getByRole("button", { name: /add semester/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Drag into semester
// ---------------------------------------------------------------------------

describe("CoursePlanner — drag into semester", () => {
  it("adds a course to the semester it is dropped on", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    expect(screen.getByTestId("semester-year1-fall")).toHaveTextContent(
      "Modern Programming Fundamentals"
    );
  });

  it("displays the course's credit count inside the semester after a drop", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    const semester = screen.getByTestId("semester-year1-fall");
    expect(within(semester).getByText(/4\s*cr/i)).toBeInTheDocument();
  });

  it("shows a warning (role=alert) when the same course is dropped into a second semester", async () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    drop("CSCI141", "year2-fall");
    expect(await screen.findByRole("alert")).toHaveTextContent(/already/i);
  });

  it("still places the duplicate course despite showing the warning", async () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    drop("CSCI141", "year2-fall");
    await screen.findByRole("alert");
    expect(screen.getByTestId("semester-year2-fall")).toHaveTextContent(
      "Modern Programming Fundamentals"
    );
  });

  it("ignores a drop when the course is released outside any semester", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    act(() => {
      triggerDrop?.({ active: { id: "CSCI141" }, over: null });
    });
    expect(
      usePlannerStore.getState().semesters.every((s) => s.courses.length === 0)
    ).toBe(true);
  });

  it("shows a warning when the semester credit total would exceed 18", async () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    // 4 + 4 + 4 + 6 = 18 is fine; adding one more 4-credit course pushes to 22
    drop("CSCI141", "year1-fall"); // 4 cr
    drop("MATH111", "year1-fall"); // 8 cr
    drop("MUSC499", "year1-fall"); // 14 cr
    drop("CSCI301", "year1-fall"); // would need prereq; use a no-prereq course instead
    // CSCI301 is blocked by prereq; add MATH111 again (duplicate) to trigger credit warning
    // Seed via store directly: add MATH111 twice worth of credits
    const store = usePlannerStore.getState();
    const sem = store.semesters.find((s) => s.id === "year1-fall")!;
    // Fill to 18 then push one more
    store.addCourse("year1-fall", { ...MATH111, code: "MATH112" });  // 4+4+4+4 = 16
    store.addCourse("year1-fall", { ...MATH111, code: "MATH113" });  // +4 = 20 → warning
    expect(await screen.findByRole("status")).toHaveTextContent(/credit/i);
  });
});

// ---------------------------------------------------------------------------
// Remove course
// ---------------------------------------------------------------------------

describe("CoursePlanner — remove course", () => {
  it("shows a Remove button on each placed course", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    const semester = screen.getByTestId("semester-year1-fall");
    expect(within(semester).getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("removes the course from the semester when the Remove button is clicked", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    fireEvent.click(
      within(screen.getByTestId("semester-year1-fall")).getByRole("button", { name: /remove/i })
    );
    expect(screen.getByTestId("semester-year1-fall")).not.toHaveTextContent(
      "Modern Programming Fundamentals"
    );
  });

  it("course remains visible in the pool after removal from the semester", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    fireEvent.click(
      within(screen.getByTestId("semester-year1-fall")).getByRole("button", { name: /remove/i })
    );
    expect(
      within(screen.getByTestId("course-pool")).getByText("Modern Programming Fundamentals")
    ).toBeInTheDocument();
  });

  it("updates the store when a course is removed", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    fireEvent.click(
      within(screen.getByTestId("semester-year1-fall")).getByRole("button", { name: /remove/i })
    );
    const sem = usePlannerStore.getState().semesters.find((s) => s.id === "year1-fall");
    expect(sem?.courses).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Prevent invalid drops — prerequisite not satisfied
// ---------------------------------------------------------------------------

describe("CoursePlanner — invalid drops (prerequisite)", () => {
  it("blocks a drop when a prerequisite has not been placed in any earlier semester", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI301", "year1-fall"); // CSCI141 is not yet in the plan
    expect(screen.getByTestId("semester-year1-fall")).not.toHaveTextContent("Data Structures");
  });

  it("shows a prerequisite error alert when the drop is blocked", async () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI301", "year1-fall");
    expect(await screen.findByRole("alert")).toHaveTextContent(/prerequisite/i);
  });

  it("allows the drop when the prerequisite is placed in a strictly earlier semester", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    drop("CSCI301", "year2-fall"); // prereq satisfied — year1-fall < year2-fall
    expect(screen.getByTestId("semester-year2-fall")).toHaveTextContent("Data Structures");
  });

  it("blocks the drop when the prerequisite is in the same semester (not earlier)", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    drop("CSCI301", "year1-fall"); // same semester does not satisfy prereq
    expect(
      within(screen.getByTestId("semester-year1-fall")).queryByText("Data Structures")
    ).not.toBeInTheDocument();
  });

  it("does not write to the store when a drop is blocked by a missing prerequisite", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI301", "year1-fall");
    const sem = usePlannerStore.getState().semesters.find((s) => s.id === "year1-fall");
    expect(sem?.courses).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Visual feedback
// ---------------------------------------------------------------------------

describe("CoursePlanner — visual feedback", () => {
  it("marks a semester column with data-over='true' when a course is dragged over it", () => {
    mockIsOver["year1-fall"] = true;
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    expect(screen.getByTestId("semester-year1-fall")).toHaveAttribute("data-over", "true");
  });

  it("marks a semester with data-invalid='true' when the active drag has an unsatisfied prereq", () => {
    // CSCI301 requires CSCI141; neither semester has CSCI141 yet
    mockIsOver["year1-fall"] = true;
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    startDrag("CSCI301");
    expect(screen.getByTestId("semester-year1-fall")).toHaveAttribute("data-invalid", "true");
  });

  it("does NOT mark a semester invalid when the active drag's prereq is already satisfied", () => {
    mockIsOver["year2-fall"] = true;
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");  // prereq placed in earlier semester
    startDrag("CSCI301");
    expect(screen.getByTestId("semester-year2-fall")).not.toHaveAttribute("data-invalid", "true");
  });

  it("marks a course card in the pool with data-dragging='true' while it is being dragged", () => {
    mockIsDragging["CSCI141"] = true;
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    expect(screen.getByTestId("course-card-CSCI141")).toHaveAttribute("data-dragging", "true");
  });

  it("marks a placed course card in the pool with data-placed='true'", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    expect(screen.getByTestId("course-card-CSCI141")).toHaveAttribute("data-placed", "true");
  });
});

// ---------------------------------------------------------------------------
// Semester management
// ---------------------------------------------------------------------------

describe("CoursePlanner — semester management", () => {
  it("adds a ninth semester when 'Add Semester' is clicked", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    fireEvent.click(screen.getByRole("button", { name: /add semester/i }));
    expect(screen.getAllByRole("region")).toHaveLength(9);
  });

  it("renders a Remove Semester button on each semester column", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    expect(screen.getAllByRole("button", { name: /remove semester/i })).toHaveLength(8);
  });

  it("removes a semester column when its Remove Semester button is clicked", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    fireEvent.click(screen.getAllByRole("button", { name: /remove semester/i })[0]);
    expect(screen.getAllByRole("region")).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Zustand state persistence
// ---------------------------------------------------------------------------

describe("CoursePlanner — Zustand state persistence", () => {
  it("placed courses survive a component re-render (store is not reset on mount)", () => {
    const { rerender } = render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    rerender(<CoursePlanner availableCourses={ALL_COURSES} />);
    expect(screen.getByTestId("semester-year1-fall")).toHaveTextContent(
      "Modern Programming Fundamentals"
    );
  });

  it("store reflects the drop after it happens", () => {
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    const sem = usePlannerStore.getState().semesters.find((s) => s.id === "year1-fall");
    expect(sem?.courses.some((c) => c.code === "CSCI141")).toBe(true);
  });

  it("store is clean at the start of each test (beforeEach reset guarantee)", () => {
    expect(
      usePlannerStore.getState().semesters.every((s) => s.courses.length === 0)
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

describe("CoursePlanner — save", () => {
  it("POSTs to /api/schedule when the Save button is clicked", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "sched-1" }) });
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/schedule",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("shows a success message after a successful save", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "sched-1" }) });
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  it("shows an error alert if the save request fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("disables the Save button while the request is in flight", async () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<CoursePlanner availableCourses={ALL_COURSES} />);
    drop("CSCI141", "year1-fall");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled()
    );
  });
});
