// file: tests/course-search.test.tsx

/**
 * Phase 12 — Course Search Component
 *
 * Tests for <CourseSearch />, a filterable, paginated course catalog browser.
 *
 * Component contract:
 *   - Fetches from GET /api/courses/search with filter + pagination params.
 *   - Inline per-card fields: code, title, department, credits, collAttribute.
 *   - Expanded (click-to-reveal) fields: prerequisites, professor, location.
 *   - Filter controls: text search (title/code), department dropdown, COLL dropdown.
 *   - Pagination: prev / next buttons; prev disabled on page 1, next on last page.
 *
 * fetch is mocked globally — no real network calls.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CourseSearch } from "@/components/CourseSearch";

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

interface MockCourse {
  code: string;
  title: string;
  department: string;
  credits: number;
  collAttribute: string | null;
  prerequisiteCodes: string[];
  sections: Array<{ professor: string; location: string; days: string }>;
}

function mockSuccess(
  courses: MockCourse[],
  total = courses.length,
  page = 1,
  limit = 20
) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ courses, total, page, limit }),
  });
}

function mockEmpty() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ courses: [], total: 0, page: 1, limit: 20 }),
  });
}

function mockNetworkError() {
  mockFetch.mockRejectedValue(new Error("Network error"));
}

function mockServerError() {
  mockFetch.mockResolvedValue({ ok: false, status: 500 });
}

// ---------------------------------------------------------------------------
// Sample fixtures
// ---------------------------------------------------------------------------

const CSCI141: MockCourse = {
  code: "CSCI141",
  title: "Intro to Computer Science",
  department: "CSCI",
  credits: 3,
  collAttribute: null,
  prerequisiteCodes: [],
  sections: [{ professor: "Dr. Smith", location: "McGlothlin-Street 020", days: "MWF" }],
};

const ENGL101: MockCourse = {
  code: "ENGL101",
  title: "Introduction to Writing",
  department: "ENGL",
  credits: 3,
  collAttribute: "COLL 100",
  prerequisiteCodes: ["ENGL100"],
  sections: [{ professor: "Dr. Jones", location: "Blair 212", days: "TR" }],
};

const CSCI301: MockCourse = {
  code: "CSCI301",
  title: "Data Structures",
  department: "CSCI",
  credits: 4,
  collAttribute: null,
  prerequisiteCodes: ["CSCI141", "CSCI142"],
  sections: [{ professor: "Dr. Park", location: "McGlothlin-Street 100", days: "MWF" }],
};

beforeEach(() => mockFetch.mockClear());

// ---------------------------------------------------------------------------
// Initial render
// ---------------------------------------------------------------------------

describe("CourseSearch — initial render", () => {
  it("renders a search input", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    expect(screen.getByRole("textbox", { name: /search/i })).toBeInTheDocument();
  });

  it("renders a department dropdown", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    expect(screen.getByRole("combobox", { name: /department/i })).toBeInTheDocument();
  });

  it("renders a COLL attribute dropdown", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    expect(screen.getByRole("combobox", { name: /coll/i })).toBeInTheDocument();
  });

  it("COLL dropdown contains all six W&M COLL levels", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    const collSelect = screen.getByRole("combobox", { name: /coll/i });
    const options = Array.from((collSelect as HTMLSelectElement).options).map(
      (o) => o.value
    );
    expect(options).toEqual(
      expect.arrayContaining(["COLL 100", "COLL 150", "COLL 200", "COLL 300", "COLL 350", "COLL 500"])
    );
  });

  it("fetches courses on mount with no filters", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/courses/search");
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("CourseSearch — loading state", () => {
  it("shows a loading indicator while the initial fetch is in progress", () => {
    // Never resolves during this test
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<CourseSearch />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("removes the loading indicator once data arrives", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    );
  });
});

// ---------------------------------------------------------------------------
// Course card display — inline fields
// ---------------------------------------------------------------------------

describe("CourseSearch — course card inline fields", () => {
  it("displays the course code on each card", async () => {
    mockSuccess([CSCI141, ENGL101]);
    render(<CourseSearch />);
    expect(await screen.findByText("CSCI141")).toBeInTheDocument();
    expect(await screen.findByText("ENGL101")).toBeInTheDocument();
  });

  it("displays the course title on each card", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    expect(await screen.findByText(/Intro to Computer Science/i)).toBeInTheDocument();
  });

  it("displays the department on each card", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    expect(await screen.findByText(/CSCI/)).toBeInTheDocument();
  });

  it("displays the credit count on each card", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    expect(await screen.findByText(/3\s*cr/i)).toBeInTheDocument();
  });

  it("displays the collAttribute when it exists", async () => {
    mockSuccess([ENGL101]);
    render(<CourseSearch />);
    const card = await screen.findByRole("article");
    expect(within(card).getByText(/COLL 100/)).toBeInTheDocument();
  });

  it("does not display a COLL badge when collAttribute is null", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    const card = await screen.findByRole("article");
    // COLL badge should not appear on the card for a course with no collAttribute
    expect(within(card).queryByText(/COLL \d/)).not.toBeInTheDocument();
  });

  it("renders one card per course returned", async () => {
    mockSuccess([CSCI141, ENGL101, CSCI301]);
    render(<CourseSearch />);
    await waitFor(() =>
      expect(screen.getAllByRole("article")).toHaveLength(3)
    );
  });
});

// ---------------------------------------------------------------------------
// Expand / collapse — detail fields
// ---------------------------------------------------------------------------

describe("CourseSearch — expand / collapse", () => {
  it("does not show professor, location, or prerequisites before expanding", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    await screen.findByText("CSCI141");
    expect(screen.queryByText(/Dr\. Smith/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/McGlothlin/i)).not.toBeInTheDocument();
  });

  it("reveals professor, location, and prerequisites after clicking the expand button", async () => {
    mockSuccess([ENGL101]);
    render(<CourseSearch />);
    const expandBtn = await screen.findByRole("button", { name: /details|expand|more/i });
    fireEvent.click(expandBtn);
    expect(screen.getByText(/Dr\. Jones/i)).toBeInTheDocument();
    expect(screen.getByText(/Blair 212/i)).toBeInTheDocument();
    expect(screen.getByText(/ENGL100/)).toBeInTheDocument();
  });

  it("shows prerequisite codes for a course with prerequisites", async () => {
    mockSuccess([CSCI301]);
    render(<CourseSearch />);
    const expandBtn = await screen.findByRole("button", { name: /details|expand|more/i });
    fireEvent.click(expandBtn);
    expect(screen.getByText(/CSCI141/)).toBeInTheDocument();
    expect(screen.getByText(/CSCI142/)).toBeInTheDocument();
  });

  it("shows 'None' or equivalent when a course has no prerequisites", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    const expandBtn = await screen.findByRole("button", { name: /details|expand|more/i });
    fireEvent.click(expandBtn);
    expect(screen.getByText(/none/i)).toBeInTheDocument();
  });

  it("hides the details again after clicking the expand button a second time", async () => {
    mockSuccess([ENGL101]);
    render(<CourseSearch />);
    const expandBtn = await screen.findByRole("button", { name: /details|expand|more/i });
    fireEvent.click(expandBtn);
    expect(screen.getByText(/Dr\. Jones/i)).toBeInTheDocument();
    fireEvent.click(expandBtn);
    expect(screen.queryByText(/Dr\. Jones/i)).not.toBeInTheDocument();
  });

  it("expanding one card does not expand others", async () => {
    mockSuccess([CSCI141, ENGL101]);
    render(<CourseSearch />);
    const expandBtns = await screen.findAllByRole("button", { name: /details|expand|more/i });
    fireEvent.click(expandBtns[0]); // expand CSCI141
    // ENGL101's professor should not be visible
    expect(screen.queryByText(/Dr\. Jones/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Filtering — text search
// ---------------------------------------------------------------------------

describe("CourseSearch — text search filter", () => {
  it("re-fetches with the search term when the user types in the search box", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockClear();
    mockSuccess([CSCI141]);
    const input = screen.getByRole("textbox", { name: /search/i });
    fireEvent.change(input, { target: { value: "Computer" } });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("Computer");
  });

  it("resets to page 1 when the search term changes", async () => {
    // Start on page 2
    mockSuccess([CSCI141], 40, 2);
    render(<CourseSearch />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockClear();
    mockSuccess([CSCI141]);
    const input = screen.getByRole("textbox", { name: /search/i });
    fireEvent.change(input, { target: { value: "Data" } });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toMatch(/page=1/);
  });
});

// ---------------------------------------------------------------------------
// Filtering — department dropdown
// ---------------------------------------------------------------------------

describe("CourseSearch — department filter", () => {
  it("re-fetches with the selected department when the dropdown changes", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockClear();
    mockSuccess([CSCI141]);
    const deptSelect = screen.getByRole("combobox", { name: /department/i });
    fireEvent.change(deptSelect, { target: { value: "CSCI" } });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("department=CSCI");
  });

  it("resets to page 1 when the department filter changes", async () => {
    mockSuccess([CSCI141]);
    render(<CourseSearch />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockClear();
    mockSuccess([CSCI141]);
    fireEvent.change(
      screen.getByRole("combobox", { name: /department/i }),
      { target: { value: "ENGL" } }
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toMatch(/page=1/);
  });
});

// ---------------------------------------------------------------------------
// Filtering — COLL dropdown
// ---------------------------------------------------------------------------

describe("CourseSearch — COLL filter", () => {
  it("re-fetches with the selected COLL level when the dropdown changes", async () => {
    mockSuccess([ENGL101]);
    render(<CourseSearch />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockClear();
    mockSuccess([ENGL101]);
    const collSelect = screen.getByRole("combobox", { name: /coll/i });
    fireEvent.change(collSelect, { target: { value: "COLL 100" } });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const url = mockFetch.mock.calls[0][0] as string;
    // URLSearchParams encodes spaces as +; replace before decoding
    expect(decodeURIComponent(url.replace(/\+/g, " "))).toContain("collAttribute=COLL 100");
  });

  it("resets to page 1 when the COLL filter changes", async () => {
    mockSuccess([ENGL101]);
    render(<CourseSearch />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockClear();
    mockSuccess([ENGL101]);
    fireEvent.change(
      screen.getByRole("combobox", { name: /coll/i }),
      { target: { value: "COLL 200" } }
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toMatch(/page=1/);
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("CourseSearch — empty state", () => {
  it("shows a no-results message when the API returns an empty array", async () => {
    mockEmpty();
    render(<CourseSearch />);
    expect(await screen.findByText(/no courses found/i)).toBeInTheDocument();
  });

  it("does not render any course cards in the empty state", async () => {
    mockEmpty();
    render(<CourseSearch />);
    await screen.findByText(/no courses found/i);
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe("CourseSearch — error state", () => {
  it("shows an error message when the fetch rejects", async () => {
    mockNetworkError();
    render(<CourseSearch />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an error message when the server returns a non-ok response", async () => {
    mockServerError();
    render(<CourseSearch />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("does not render course cards in the error state", async () => {
    mockNetworkError();
    render(<CourseSearch />);
    await screen.findByRole("alert");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe("CourseSearch — pagination", () => {
  it("renders prev and next buttons", async () => {
    mockSuccess([CSCI141], 40);
    render(<CourseSearch />);
    await screen.findByText("CSCI141");
    expect(screen.getByRole("button", { name: /prev/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("prev button is disabled on page 1", async () => {
    mockSuccess([CSCI141], 40, 1);
    render(<CourseSearch />);
    await screen.findByText("CSCI141");
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
  });

  it("next button is disabled when all results fit on the current page", async () => {
    // total = 1, limit = 20 → only one page
    mockSuccess([CSCI141], 1, 1, 20);
    render(<CourseSearch />);
    await screen.findByText("CSCI141");
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("clicking next fetches page 2", async () => {
    mockSuccess([CSCI141], 40, 1);
    render(<CourseSearch />);
    await screen.findByText("CSCI141");

    mockFetch.mockClear();
    mockSuccess([CSCI301], 40, 2);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("page=2");
  });

  it("clicking prev from page 2 fetches page 1", async () => {
    mockSuccess([CSCI141], 40, 1);
    render(<CourseSearch />);
    await screen.findByText("CSCI141");

    // Navigate to page 2 first
    mockFetch.mockClear();
    mockSuccess([CSCI301], 40, 2);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("CSCI301");

    // Now click prev — must not be disabled and must fetch page 1
    mockFetch.mockClear();
    mockSuccess([CSCI141], 40, 1);
    const prevBtn = screen.getByRole("button", { name: /prev/i });
    expect(prevBtn).not.toBeDisabled();
    fireEvent.click(prevBtn);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("page=1");
  });

  it("displays the current page number", async () => {
    mockSuccess([CSCI141], 40, 1);
    render(<CourseSearch />);
    await screen.findByText("CSCI141");
    expect(screen.getByText(/page\s*1/i)).toBeInTheDocument();
  });

  it("next button is disabled when on the last page", async () => {
    // total = 21, limit = 20 → 2 pages; navigate to page 2
    mockSuccess([CSCI141], 21, 1, 20);
    render(<CourseSearch />);
    await screen.findByText("CSCI141");

    mockFetch.mockClear();
    mockSuccess([CSCI301], 21, 2, 20);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("CSCI301");

    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });
});
