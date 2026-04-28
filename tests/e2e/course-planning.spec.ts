// file: tests/e2e/course-planning.spec.ts
//
// E2E tests for the core course-planning drag-and-drop flow.
//
// Approach:
//   - Mock /api/courses/search to return a small, known catalog.
//   - Navigate directly to /planner (bypassing login via mocked session cookie).
//   - Use page.mouse to simulate dnd-kit pointer-sensor drags, which don't
//     respond to the HTML5 drag API used by Playwright's built-in dragTo().

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const COURSES = [
  {
    code: "CSCI141",
    title: "Introduction to Programming",
    credits: 4,
    prerequisiteCodes: [],
    sections: [{ professor: "Dr. Smith", location: "ISC 1111", days: "MWF" }],
  },
  {
    code: "MATH112",
    title: "Calculus I",
    credits: 4,
    prerequisiteCodes: [],
    sections: [{ professor: "Dr. Jones", location: "Millington 150", days: "TTh" }],
  },
  {
    code: "CSCI241",
    title: "Data Structures",
    credits: 4,
    prerequisiteCodes: ["CSCI141"],
    sections: [{ professor: "Dr. Brown", location: "ISC 1111", days: "MWF" }],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate a dnd-kit pointer drag from one element to another. */
async function dndKitDrag(
  page: import("@playwright/test").Page,
  draggable: import("@playwright/test").Locator,
  droppable: import("@playwright/test").Locator,
) {
  const fromBox = await draggable.boundingBox();
  const toBox   = await droppable.boundingBox();

  if (!fromBox || !toBox) throw new Error("Could not get bounding boxes for drag targets");

  const fromX = fromBox.x + fromBox.width / 2;
  const fromY = fromBox.y + fromBox.height / 2;
  const toX   = toBox.x + toBox.width / 2;
  const toY   = toBox.y + toBox.height / 2;

  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  // Move in small steps so the pointer sensor's distance threshold fires
  await page.mouse.move(fromX + 5, fromY + 5, { steps: 2 });
  await page.mouse.move(toX, toY, { steps: 15 });
  await page.mouse.up();
}

async function goToPlanner(page: import("@playwright/test").Page) {
  await page.route("/api/courses/search*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ courses: COURSES }),
    });
  });

  // Stub schedule-save so clicking "Save Schedule" doesn't fail
  await page.route("/api/schedule", async (route) => {
    await route.fulfill({ status: 200, body: "{}" });
  });

  await page.goto("/planner");
  // Wait for the course pool to be populated
  await expect(page.getByTestId("course-pool")).toBeVisible();
  await expect(page.getByTestId("course-card-CSCI141")).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Course planning", () => {
  test("course pool shows all available courses", async ({ page }) => {
    await goToPlanner(page);

    await expect(page.getByTestId("course-card-CSCI141")).toBeVisible();
    await expect(page.getByTestId("course-card-MATH112")).toBeVisible();
    await expect(page.getByTestId("course-card-CSCI241")).toBeVisible();
  });

  test("search filters the course pool by code", async ({ page }) => {
    await goToPlanner(page);

    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill("CSCI");

    await expect(page.getByTestId("course-card-CSCI141")).toBeVisible();
    await expect(page.getByTestId("course-card-CSCI241")).toBeVisible();
    await expect(page.getByTestId("course-card-MATH112")).not.toBeVisible();
  });

  test("search filters the course pool by title", async ({ page }) => {
    await goToPlanner(page);

    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill("Calculus");

    await expect(page.getByTestId("course-card-MATH112")).toBeVisible();
    await expect(page.getByTestId("course-card-CSCI141")).not.toBeVisible();
  });

  test("clearing search restores all courses", async ({ page }) => {
    await goToPlanner(page);

    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill("CSCI");
    await searchInput.fill("");

    await expect(page.getByTestId("course-card-MATH112")).toBeVisible();
  });

  test("drag course from pool to semester places it in the semester", async ({ page }) => {
    await goToPlanner(page);

    const card     = page.getByTestId("course-card-CSCI141");
    const semester = page.getByTestId(/^semester-/).first();

    await dndKitDrag(page, card, semester);

    // The semester should now contain the course
    await expect(semester).toContainText("CSCI141");
    // The pool card should be marked as placed
    await expect(card).toHaveAttribute("data-placed", "true");
  });

  test("drag a second course to the same semester", async ({ page }) => {
    await goToPlanner(page);

    const semester = page.getByTestId(/^semester-/).first();

    await dndKitDrag(page, page.getByTestId("course-card-CSCI141"), semester);
    await dndKitDrag(page, page.getByTestId("course-card-MATH112"), semester);

    await expect(semester).toContainText("CSCI141");
    await expect(semester).toContainText("MATH112");
  });

  test("placed course can be removed via the × button", async ({ page }) => {
    await goToPlanner(page);

    const semester = page.getByTestId(/^semester-/).first();
    await dndKitDrag(page, page.getByTestId("course-card-CSCI141"), semester);
    await expect(semester).toContainText("CSCI141");

    // Reset dnd-kit pointer capture state before clicking
    await page.mouse.move(0, 0);

    // Click the remove button (full-page search in case pointer capture affects scope)
    await page.getByRole("button", { name: /Remove CSCI141/i }).click();
    await expect(semester).not.toContainText("CSCI141");

    // Pool card is no longer marked as placed
    await expect(page.getByTestId("course-card-CSCI141")).not.toHaveAttribute("data-placed", "true");
  });

  test("prerequisite error shown when dragging CSCI241 before CSCI141", async ({ page }) => {
    await goToPlanner(page);

    // Drop CSCI241 (requires CSCI141) into the first semester without placing CSCI141 first
    const semester = page.getByTestId(/^semester-/).first();
    await dndKitDrag(page, page.getByTestId("course-card-CSCI241"), semester);

    // An error notification should appear
    await expect(page.getByTestId("planner-notification")).toContainText(/prerequisite/i);
    // The course should NOT be in the semester
    await expect(semester).not.toContainText("CSCI241");
  });

  test("adding a new semester works", async ({ page }) => {
    await goToPlanner(page);

    const initialCount = await page.getByTestId(/^semester-/).count();
    await page.click('button:has-text("+ Add Semester")');
    await expect(page.getByTestId(/^semester-/)).toHaveCount(initialCount + 1);
  });
});
