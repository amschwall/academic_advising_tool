// file: tests/e2e/schedule-generation.spec.ts
//
// E2E tests for the "Generate Schedule" UI.
//
// NOTE: The "Generate Schedule" button and preferences panel do not exist yet
// in CoursePlanner — they will be added as part of this phase's implementation.
// These tests define the expected behavior and data-testid contract.
//
// Expected UI contract:
//   data-testid="generate-schedule-btn"  — button in the planner header
//   data-testid="generate-modal"         — preferences modal/dialog
//   data-testid="generate-semesters"     — number-of-semesters input (1–8)
//   data-testid="generate-max-credits"   — max-credits-per-semester input
//   data-testid="generate-submit"        — "Generate" submit button in modal
//   data-testid="generate-success"       — success banner after generation
//   data-testid="generate-error"         — error banner on API failure

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CATALOG = [
  { code: "CSCI141", title: "Intro to Programming", credits: 4, prerequisiteCodes: [], sections: [] },
  { code: "MATH112", title: "Calculus I",            credits: 4, prerequisiteCodes: [], sections: [] },
  { code: "CSCI241", title: "Data Structures",       credits: 4, prerequisiteCodes: ["CSCI141"], sections: [] },
];

/** A minimal generated plan the API would return. */
const GENERATED_PLAN = {
  success: true,
  plan: {
    semesters: [
      {
        id: "gen-sem-1",
        label: "Fall Year 1",
        year: 1,
        season: "Fall",
        courses: [
          { code: "CSCI141", title: "Intro to Programming", credits: 4, recommendedSectionId: null },
          { code: "MATH112", title: "Calculus I",           credits: 4, recommendedSectionId: null },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function goToPlanner(page: import("@playwright/test").Page) {
  await page.route("/api/courses/search*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ courses: CATALOG }),
    });
  });
  await page.route("/api/schedule", async (route) => {
    await route.fulfill({ status: 200, body: "{}" });
  });
  await page.goto("/planner");
  await expect(page.getByTestId("course-pool")).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Schedule generation", () => {
  test("Generate Schedule button is visible in the planner header", async ({ page }) => {
    await goToPlanner(page);
    await expect(page.getByTestId("generate-schedule-btn")).toBeVisible();
  });

  test("clicking Generate Schedule opens the preferences modal", async ({ page }) => {
    await goToPlanner(page);
    await page.getByTestId("generate-schedule-btn").click();
    await expect(page.getByTestId("generate-modal")).toBeVisible();
  });

  test("preferences modal has semester count and max-credits inputs", async ({ page }) => {
    await goToPlanner(page);
    await page.getByTestId("generate-schedule-btn").click();

    await expect(page.getByTestId("generate-semesters")).toBeVisible();
    await expect(page.getByTestId("generate-max-credits")).toBeVisible();
    await expect(page.getByTestId("generate-submit")).toBeVisible();
  });

  test("successful generation shows a success banner", async ({ page }) => {
    await goToPlanner(page);

    // Mock the generate API
    await page.route("/api/schedule/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(GENERATED_PLAN),
      });
    });

    await page.getByTestId("generate-schedule-btn").click();
    await page.getByTestId("generate-submit").click();

    await expect(page.getByTestId("generate-success")).toBeVisible();
  });

  test("generated courses are placed into the planner semesters", async ({ page }) => {
    await goToPlanner(page);

    await page.route("/api/schedule/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(GENERATED_PLAN),
      });
    });

    await page.getByTestId("generate-schedule-btn").click();
    await page.getByTestId("generate-submit").click();

    // Both courses from the generated plan should appear in the planner grid
    await expect(page.getByText("CSCI141")).toBeVisible();
    await expect(page.getByText("MATH112")).toBeVisible();
  });

  test("API failure shows an error banner", async ({ page }) => {
    await goToPlanner(page);

    await page.route("/api/schedule/generate", async (route) => {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ success: false, errors: ["Not enough electives in pool"] }),
      });
    });

    await page.getByTestId("generate-schedule-btn").click();
    await page.getByTestId("generate-submit").click();

    await expect(page.getByTestId("generate-error")).toBeVisible();
  });

  test("closing the modal without submitting does not change the planner", async ({ page }) => {
    await goToPlanner(page);

    const initialSemesterText = await page.getByTestId(/^semester-/).first().textContent();

    await page.getByTestId("generate-schedule-btn").click();
    await expect(page.getByTestId("generate-modal")).toBeVisible();

    // Press Escape to close
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("generate-modal")).not.toBeVisible();

    // Planner unchanged
    await expect(page.getByTestId(/^semester-/).first()).toHaveText(initialSemesterText ?? "");
  });
});
