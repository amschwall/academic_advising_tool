// file: tests/e2e/login.spec.ts
//
// E2E tests for the student login flow.
//
// Strategy:
//   - Intercept the Supabase /auth/v1/token call (browser-side SDK) to avoid
//     needing real credentials.
//   - Intercept /api/auth/login (our server session-cookie endpoint) to return
//     a fake session without hitting Supabase on the server.
//   - Intercept /api/courses/search so the redirect target loads cleanly.

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wire up all auth-related route mocks for a single test. */
async function mockAuth(page: import("@playwright/test").Page, opts: { allowEmail?: string } = {}) {
  const allowedDomain = "@wm.edu";

  // Supabase token endpoint — called from the browser SDK
  await page.route("**/auth/v1/token**", async (route) => {
    const raw = route.request().postData() ?? "{}";
    let email = "";
    try {
      email = JSON.parse(raw).email ?? "";
    } catch {
      // grant_type=password form bodies — try parsing form data
      const params = new URLSearchParams(raw);
      email = params.get("email") ?? "";
    }

    if (!email.endsWith(allowedDomain)) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid login credentials",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "fake-access-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "fake-refresh-token",
        user: {
          id: "test-user-id",
          email,
          app_metadata: {},
          user_metadata: { major: "Undecided" },
          aud: "authenticated",
        },
      }),
    });
  });

  // Our session-cookie exchange endpoint
  await page.route("/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "test-user-id", email: opts.allowEmail ?? "student@wm.edu" } }),
      headers: { "Set-Cookie": "session=fake-session; Path=/" },
    });
  });

  // Courses API — needed so /courses page doesn't hang
  await page.route("/api/courses/search*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ courses: [] }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Login page", () => {
  test("shows the William & Mary heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /william.*mary/i })).toBeVisible();
  });

  test("shows validation error when both fields are empty", async ({ page }) => {
    await page.goto("/");
    await page.click('[aria-label="Sign In"]');
    await expect(page.getByTestId("login-error")).toBeVisible();
  });

  test("rejects non-wm.edu email before calling the network", async ({ page }) => {
    await mockAuth(page);
    await page.goto("/");

    // Fill a gmail address — the client-side guard should fire immediately
    await page.fill("#email", "student@gmail.com");
    await page.fill("#password", "password123");
    await page.click('[aria-label="Sign In"]');

    // Error should mention the domain restriction
    const alert = page.getByTestId("login-error");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/wm\.edu/i);

    // Must NOT have navigated away
    await expect(page).toHaveURL("/");
  });

  test("rejects a non-wm.edu email even when the network would accept it", async ({ page }) => {
    // Override the Supabase mock to accept anything, to confirm the
    // client-side guard is the one blocking — not the network response.
    await page.route("**/auth/v1/token**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "t", token_type: "bearer", expires_in: 3600, refresh_token: "r" }),
      });
    });

    await page.goto("/");
    await page.fill("#email", "attacker@evil.com");
    await page.fill("#password", "password123");
    await page.click('[aria-label="Sign In"]');

    await expect(page.getByTestId("login-error")).toContainText(/wm\.edu/i);
    await expect(page).toHaveURL("/");
  });

  test("redirects to /courses after a successful wm.edu login", async ({ page }) => {
    await mockAuth(page, { allowEmail: "student@wm.edu" });
    await page.goto("/");

    await page.fill("#email", "student@wm.edu");
    await page.fill("#password", "password123");
    await page.click('[aria-label="Sign In"]');

    await expect(page).toHaveURL("/courses");
  });

  test("shows spinner while signing in", async ({ page }) => {
    // Slow down the Supabase response so the loading state is visible
    await page.route("**/auth/v1/token**", async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "fake-access-token",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "fake-refresh-token",
          user: { id: "u", email: "s@wm.edu", app_metadata: {}, user_metadata: {}, aud: "authenticated" },
        }),
      });
    });
    await page.route("/api/auth/login", (route) =>
      route.fulfill({ status: 200, body: "{}" })
    );
    await page.route("/api/courses/search*", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ courses: [] }) })
    );

    await page.goto("/");
    await page.fill("#email", "student@wm.edu");
    await page.fill("#password", "password123");
    await page.click('[aria-label="Sign In"]');

    // Spinner / "Signing in" text should appear briefly
    await expect(page.getByRole("status", { name: /signing in/i })).toBeVisible();
  });
});
