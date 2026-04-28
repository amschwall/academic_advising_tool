// file: tests/login.test.tsx

/**
 * Phase 13 (pre) — Login Page
 *
 * Tests for <LoginForm />, the first screen a user sees.
 *
 * Login flow:
 *   1. User submits email + password.
 *   2. Component calls supabase.auth.signInWithPassword → gets access_token.
 *   3. POSTs { token } to POST /api/auth/login → server sets session cookie.
 *   4. On success → router.push("/courses").
 *
 * Mocks:
 *   @/lib/supabase  — signInWithPassword (no real Supabase project needed)
 *   next/navigation — useRouter (no Next.js runtime needed)
 *   global.fetch    — /api/auth/login call
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock declarations — factories use jest.fn() inline to avoid hoisting issues
// ---------------------------------------------------------------------------

jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { signInWithPassword: jest.fn() } },
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (resolved after mocks are in place)
// ---------------------------------------------------------------------------

import { LoginForm } from "@/components/LoginForm";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Mock references — cast imported mocks so we can call .mockResolvedValue etc.
// ---------------------------------------------------------------------------

const mockSignIn  = supabase.auth.signInWithPassword as jest.Mock;
const mockRouter  = useRouter as jest.Mock;
const mockPush    = jest.fn();
const mockFetch   = jest.fn();
global.fetch      = mockFetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Supabase responds with a valid session. */
function mockSupabaseSuccess(token = "access-token-xyz") {
  mockSignIn.mockResolvedValue({
    data: { session: { access_token: token } },
    error: null,
  });
}

/** Supabase rejects the credentials. */
function mockSupabaseError(message = "Invalid login credentials") {
  mockSignIn.mockResolvedValue({
    data: { session: null },
    error: { message },
  });
}

/** /api/auth/login responds with 200. */
function mockLoginApiSuccess() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ user: { email: "sparky@wm.edu" } }),
  });
}

/** /api/auth/login responds with a non-ok status. */
function mockLoginApiError(status = 401) {
  mockFetch.mockResolvedValue({ ok: false, status });
}

/** Fill in the form and click submit. */
function submitForm(email = "sparky@wm.edu", password = "password123") {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in|log in|login/i }));
}

beforeEach(() => {
  mockSignIn.mockReset();
  mockFetch.mockReset();
  mockPush.mockReset();
  mockRouter.mockReturnValue({ push: mockPush });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("LoginForm — rendering", () => {
  it("renders an email input", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("renders a password input", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("password input has type='password' so characters are hidden", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "password");
  });

  it("renders a submit button", () => {
    render(<LoginForm />);
    expect(
      screen.getByRole("button", { name: /sign in|log in|login/i })
    ).toBeInTheDocument();
  });

  it("renders W&M branding or a page heading", () => {
    render(<LoginForm />);
    expect(
      screen.getByRole("heading") ||
      screen.getByText(/william & mary|w&m|advising/i)
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

describe("LoginForm — field validation", () => {
  it("shows an error when submitted with an empty email", async () => {
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in|log in|login/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows an error when submitted with an empty password", async () => {
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "sparky@wm.edu" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in|log in|login/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("does not call Supabase when both fields are empty", () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /sign in|log in|login/i }));
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("LoginForm — loading state", () => {
  it("disables the submit button while the request is in progress", async () => {
    mockSignIn.mockReturnValue(new Promise(() => {})); // never resolves
    render(<LoginForm />);
    submitForm();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /sign in|log in|login/i })
      ).toBeDisabled()
    );
  });

  it("shows a loading indicator while the request is in progress", async () => {
    mockSignIn.mockReturnValue(new Promise(() => {}));
    render(<LoginForm />);
    submitForm();
    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument()
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling — Supabase error
// ---------------------------------------------------------------------------

describe("LoginForm — Supabase auth errors", () => {
  it("shows an error message when Supabase returns invalid credentials", async () => {
    mockSupabaseError("Invalid login credentials");
    render(<LoginForm />);
    submitForm();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("error message contains text from the Supabase error", async () => {
    mockSupabaseError("Invalid login credentials");
    render(<LoginForm />);
    submitForm();
    expect(
      await screen.findByText(/invalid login credentials/i)
    ).toBeInTheDocument();
  });

  it("does not redirect when Supabase returns an error", async () => {
    mockSupabaseError();
    render(<LoginForm />);
    submitForm();
    await screen.findByRole("alert");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("re-enables the submit button after a Supabase error", async () => {
    mockSupabaseError();
    render(<LoginForm />);
    submitForm();
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: /sign in|log in|login/i })
    ).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Error handling — API error
// ---------------------------------------------------------------------------

describe("LoginForm — login API errors", () => {
  it("shows an error when the login API returns a non-ok response", async () => {
    mockSupabaseSuccess();
    mockLoginApiError(401);
    render(<LoginForm />);
    submitForm();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("does not redirect when the login API fails", async () => {
    mockSupabaseSuccess();
    mockLoginApiError();
    render(<LoginForm />);
    submitForm();
    await screen.findByRole("alert");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows an error when the network request rejects entirely", async () => {
    mockSupabaseSuccess();
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<LoginForm />);
    submitForm();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

describe("LoginForm — success", () => {
  it("redirects to /courses after a successful login", async () => {
    mockSupabaseSuccess();
    mockLoginApiSuccess();
    render(<LoginForm />);
    submitForm();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/courses"));
  });

  it("calls signInWithPassword with the entered email and password", async () => {
    mockSupabaseSuccess();
    mockLoginApiSuccess();
    render(<LoginForm />);
    submitForm("sparky@wm.edu", "mypassword");
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "sparky@wm.edu",
        password: "mypassword",
      })
    );
  });

  it("POSTs the Supabase access token to /api/auth/login", async () => {
    mockSupabaseSuccess("tok-abc");
    mockLoginApiSuccess();
    render(<LoginForm />);
    submitForm();
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/login",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("tok-abc"),
        })
      )
    );
  });

  it("hides the loading indicator after a successful login", async () => {
    mockSupabaseSuccess();
    mockLoginApiSuccess();
    render(<LoginForm />);
    submitForm();
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
