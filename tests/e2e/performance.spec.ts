// file: tests/e2e/performance.spec.ts
//
// Phase 21 — Performance E2E tests
//
// Tests:
//   5. Page load < 1s  (planner and login pages, measured via Date.now() and Navigation Timing)
//   6. AI response < 5s (mocked /api/chat SSE stream, measured from send to first text)

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared fixture data
// ---------------------------------------------------------------------------

const STUB_COURSES = [
  {
    code:              "CSCI141",
    title:             "Introduction to Programming",
    credits:           4,
    prerequisiteCodes: [],
    sections: [{ professor: "Dr. Smith", location: "ISC 1111", days: "MWF" }],
  },
  {
    code:              "MATH112",
    title:             "Calculus I",
    credits:           4,
    prerequisiteCodes: [],
    sections: [{ professor: "Dr. Jones", location: "Millington 150", days: "TTh" }],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub the course search and schedule-save routes so the planner loads. */
async function stubPlannerAPIs(page: import("@playwright/test").Page) {
  await page.route("/api/courses/search*", (route) =>
    route.fulfill({
      status:      200,
      contentType: "application/json",
      body:        JSON.stringify({ courses: STUB_COURSES }),
    }),
  );
  await page.route("/api/schedule", (route) =>
    route.fulfill({ status: 200, body: "{}" }),
  );
}

/** Navigate to /planner and wait until the course pool is interactive. */
async function goToPlanner(page: import("@playwright/test").Page) {
  await stubPlannerAPIs(page);
  await page.goto("/planner");
  await expect(page.getByTestId("course-pool")).toBeVisible();
}

/** Open the AI Advisor chat panel and wait for the input to appear. */
async function openChat(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /open ai advisor/i }).click();
  await expect(page.getByTestId("chat-input")).toBeVisible();
}

// ---------------------------------------------------------------------------
// 5. Page load < 1 second
//
// The strict 1 000 ms SLA applies to PRODUCTION builds (PROD=1).
// Against the dev server the threshold is relaxed to 3 000 ms so these tests
// never become flaky when the server is warm but under parallel test load.
// Run `npm run test:e2e:prod` to enforce the production SLA.
// ---------------------------------------------------------------------------

// 1 000 ms in production, 3 000 ms in dev (dev server has hot-reload overhead).
const PAGE_LOAD_MS = process.env.PROD === "1" ? 1000 : 3000;

test.describe("Performance: page load < 1s", () => {
  test("planner page is interactive (course pool visible) within SLA", async ({ page }) => {
    await stubPlannerAPIs(page);

    const start = Date.now();
    await page.goto("/planner");
    await expect(page.getByTestId("course-pool")).toBeVisible();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(PAGE_LOAD_MS);
  });

  test("login page (/) heading is visible within SLA", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /william & mary/i })).toBeVisible();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(PAGE_LOAD_MS);
  });

  test("planner domContentLoaded completes within SLA (Navigation Timing API)", async ({ page }) => {
    await stubPlannerAPIs(page);

    await page.goto("/planner");
    await page.waitForLoadState("domcontentloaded");

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        loadEvent:        nav.loadEventEnd             - nav.startTime,
      };
    });

    expect(timing.domContentLoaded).toBeLessThan(PAGE_LOAD_MS);
    expect(timing.loadEvent).toBeLessThan(PAGE_LOAD_MS);
  });

  test("planner page stays interactive on re-navigation within SLA", async ({ page }) => {
    await stubPlannerAPIs(page);
    await page.goto("/planner");
    await expect(page.getByTestId("course-pool")).toBeVisible();

    // Navigate away and back — the second load should also be fast
    await page.goto("/");
    const start = Date.now();
    await page.goto("/planner");
    await expect(page.getByTestId("course-pool")).toBeVisible();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(PAGE_LOAD_MS);
  });
});

// ---------------------------------------------------------------------------
// 6. AI chat response < 5 seconds
// ---------------------------------------------------------------------------

test.describe("Performance: AI chat response < 5s", () => {
  test("mocked chat response delivers first text within 5 seconds", async ({ page }) => {
    await page.route("/api/chat", async (route) => {
      // Simulate a realistic 200ms Anthropic network round-trip
      await new Promise<void>((r) => setTimeout(r, 200));
      await route.fulfill({
        status:      200,
        contentType: "text/event-stream",
        body: [
          'data: {"text":"Here are some course recommendations."}\n\n',
          'data: {"done":true}\n\n',
        ].join(""),
      });
    });

    await goToPlanner(page);
    await openChat(page);

    await page.getByTestId("chat-input").fill("What courses should I take?");

    const start = Date.now();
    await page.getByTestId("chat-send").click();

    await expect(page.getByTestId("chat-message-assistant-0")).toContainText(
      "Here are some course recommendations.",
    );
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });

  test("typing indicator appears while waiting for AI response", async ({ page }) => {
    await page.route("/api/chat", async (route) => {
      // 400ms delay — long enough for the typing indicator to appear
      await new Promise<void>((r) => setTimeout(r, 400));
      await route.fulfill({
        status:      200,
        contentType: "text/event-stream",
        body:        'data: {"text":"Hello!"}\n\ndata: {"done":true}\n\n',
      });
    });

    await goToPlanner(page);
    await openChat(page);

    await page.getByTestId("chat-input").fill("Hi");
    await page.getByTestId("chat-send").click();

    // Typing indicator should be present during the 400ms delay
    await expect(page.getByTestId("chat-typing-indicator")).toBeVisible();

    // Then message arrives
    await expect(page.getByTestId("chat-message-assistant-0")).toContainText("Hello!");
  });

  test("chat error is surfaced quickly (< 2s) when the API returns 500", async ({ page }) => {
    await page.route("/api/chat", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" }),
    );

    await goToPlanner(page);
    await openChat(page);

    await page.getByTestId("chat-input").fill("Hi");

    const start = Date.now();
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-error")).toBeVisible();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
  });

  test("multi-chunk streamed response completes within 5 seconds", async ({ page }) => {
    await page.route("/api/chat", async (route) => {
      // Build an SSE body with 5 chunks + done
      const body = [
        'data: {"text":"Recommended: "}\n\n',
        'data: {"text":"CSCI141 "}\n\n',
        'data: {"text":"Introduction to Programming. "}\n\n',
        'data: {"text":"Also consider "}\n\n',
        'data: {"text":"MATH112 Calculus I."}\n\n',
        'data: {"done":true}\n\n',
      ].join("");
      await route.fulfill({
        status:      200,
        contentType: "text/event-stream",
        body,
      });
    });

    await goToPlanner(page);
    await openChat(page);

    const start = Date.now();
    await page.getByTestId("chat-input").fill("Recommend courses");
    await page.getByTestId("chat-send").click();

    // Wait for the full response to assemble
    await expect(page.getByTestId("chat-message-assistant-0")).toContainText("CSCI141");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });
});
