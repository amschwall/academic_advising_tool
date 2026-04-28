// file: tests/e2e/what-if.spec.ts
//
// E2E tests for the What-If Analysis modal flow.
//
// Flow under test:
//   1. Open the What-If modal via the "What-If Analysis" button
//   2. Select a major from the dropdown
//   3. Click "Run Analysis" → modal closes, what-if becomes active
//   4. Open the Requirements panel → see major requirements appear
//   5. Re-open modal → click "Clear Analysis" → modal closes, requirements gone

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function goToPlanner(page: import("@playwright/test").Page) {
  await page.route("/api/courses/search*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ courses: [] }),
    });
  });
  await page.goto("/planner");
  await expect(page.locator("h1", { hasText: "Four-Year Planner" })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("What-If Analysis", () => {
  test("What-If Analysis button is visible in the requirements panel header", async ({ page }) => {
    await goToPlanner(page);
    await expect(page.getByRole("button", { name: /what-if analysis/i })).toBeVisible();
  });

  test("clicking the button opens the What-If modal", async ({ page }) => {
    await goToPlanner(page);
    await page.getByRole("button", { name: /what-if analysis/i }).click();
    await expect(page.getByRole("dialog", { name: /what-if/i })).toBeVisible();
  });

  test("modal contains a major selector and Run Analysis button", async ({ page }) => {
    await goToPlanner(page);
    await page.getByRole("button", { name: /what-if analysis/i }).click();

    await expect(page.locator("#what-if-major")).toBeVisible();
    await expect(page.getByRole("button", { name: /run analysis/i })).toBeVisible();
  });

  test("full what-if flow: select major → run → requirements appear → clear → requirements gone", async ({ page }) => {
    await goToPlanner(page);

    // ── Step 1: Open modal ─────────────────────────────────────────────────
    await page.getByRole("button", { name: /what-if analysis/i }).click();
    await expect(page.getByRole("dialog", { name: /what-if/i })).toBeVisible();

    // ── Step 2: Select Computer Science major ──────────────────────────────
    await page.selectOption("#what-if-major", { label: "Computer Science" });

    // ── Step 3: Run Analysis ───────────────────────────────────────────────
    await page.getByRole("button", { name: /run analysis/i }).click();

    // Modal should close
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // ── Step 4: Open requirements panel ───────────────────────────────────
    // The tracker header toggle is "View Requirements" when closed
    await page.getByRole("button", { name: /view requirements/i }).click();

    // Major requirements section should be present (switched to programs tab automatically)
    await expect(page.getByTestId("major-requirements-section")).toBeVisible();

    // Specific courses required by Computer Science should be listed
    await expect(page.getByTestId("req-major-course-CSCI141")).toBeVisible();
    await expect(page.getByTestId("req-major-course-CSCI241")).toBeVisible();
    await expect(page.getByTestId("req-major-course-CSCI303")).toBeVisible();

    // ── Step 5: Re-open modal and Clear ───────────────────────────────────
    await page.getByRole("button", { name: /what-if analysis/i }).click();
    await expect(page.getByRole("dialog", { name: /what-if/i })).toBeVisible();

    // "Clear Analysis" only appears when an analysis is active
    await expect(page.getByRole("button", { name: /clear analysis/i })).toBeVisible();
    await page.getByRole("button", { name: /clear analysis/i }).click();

    // Modal closes
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // ── Step 6: Verify requirements are gone ──────────────────────────────
    await expect(page.getByTestId("major-requirements-section")).not.toBeVisible();
    await expect(page.getByTestId("req-major-course-CSCI141")).not.toBeVisible();
  });

  test("selecting a minor also shows minor requirements", async ({ page }) => {
    await goToPlanner(page);

    await page.getByRole("button", { name: /what-if analysis/i }).click();
    await page.selectOption("#what-if-major", { label: "Computer Science" });
    await page.selectOption("#what-if-minor", { label: "Mathematics" });
    await page.getByRole("button", { name: /run analysis/i }).click();

    await page.getByRole("button", { name: /view requirements/i }).click();

    await expect(page.getByTestId("major-requirements-section")).toBeVisible();
    await expect(page.getByTestId("minor-requirements-section")).toBeVisible();
  });

  test("what-if banner is visible in the requirements panel when analysis is active", async ({ page }) => {
    await goToPlanner(page);

    await page.getByRole("button", { name: /what-if analysis/i }).click();
    await page.selectOption("#what-if-major", { label: "Economics" });
    await page.getByRole("button", { name: /run analysis/i }).click();

    await page.getByRole("button", { name: /view requirements/i }).click();

    await expect(page.getByTestId("what-if-banner")).toBeVisible();
    await expect(page.getByTestId("what-if-banner")).toContainText("Economics");
  });

  test("cancelling the modal does not activate the analysis", async ({ page }) => {
    await goToPlanner(page);

    await page.getByRole("button", { name: /what-if analysis/i }).click();
    await page.selectOption("#what-if-major", { label: "Computer Science" });
    await page.getByRole("button", { name: /cancel/i }).click();

    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Open the panel — no major requirements section should appear
    await page.getByRole("button", { name: /view requirements/i }).click();
    await expect(page.getByTestId("major-requirements-section")).not.toBeVisible();
  });

  test("Clear Analysis from the what-if banner (inside requirements panel) also works", async ({ page }) => {
    await goToPlanner(page);

    // Activate an analysis
    await page.getByRole("button", { name: /what-if analysis/i }).click();
    await page.selectOption("#what-if-major", { label: "Computer Science" });
    await page.getByRole("button", { name: /run analysis/i }).click();

    // Open the requirements panel
    await page.getByRole("button", { name: /view requirements/i }).click();

    // Use the "Clear" button inside the banner (not the modal)
    await page.getByTestId("what-if-banner").getByRole("button", { name: /clear/i }).click();

    await expect(page.getByTestId("major-requirements-section")).not.toBeVisible();
    await expect(page.getByTestId("what-if-banner")).not.toBeVisible();
  });
});
