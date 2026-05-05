// file: components/LoginForm.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useStudentStore } from "@/lib/stores/studentStore";

export function LoginForm() {
  const router     = useRouter();
  const setStudent = useStudentStore((s) => s.setStudent);

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side: require both fields before hitting the network
    if (!email || !password) {
      setError("Please enter both your email address and password.");
      return;
    }

    // Client-side: restrict to @wm.edu addresses
    if (!email.toLowerCase().endsWith("@wm.edu")) {
      setError("Only William & Mary email addresses (@wm.edu) are permitted.");
      return;
    }

    setLoading(true);

    try {
      // Step 1 — authenticate with Supabase
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !data.session) {
        setError(signInError?.message ?? "Sign in failed. Please try again.");
        return;
      }

      // Step 2 — exchange the Supabase token for a server-side session cookie
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: data.session.access_token }),
      });

      if (!res.ok) {
        setError("Login failed. Please try again.");
        return;
      }

      // Step 3 — store student info and redirect based on role
      const { user } = await res.json() as {
        user: {
          id?:      string;
          email?:   string;
          role?:    string;
          name?:    string;
          major?:   string;
          advisor?: string;
        };
      };

      setStudent({
        studentId: user?.id    ?? null,
        email:     user?.email ?? null,
        name:      user?.name  ?? null,
        major:     user?.major ?? null,
        advisor:   user?.advisor ?? null,
      });

      if (user?.role === "student") {
        router.push("/welcome");
      } else {
        router.push("/planner");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-green-900">
            William &amp; Mary
          </h1>
          <p className="mt-1 text-gray-500">Academic Advising Platform</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white px-8 py-10 shadow-lg ring-1 ring-gray-200">

          {/* Error alert */}
          {error && (
            <div
              role="alert"
              data-testid="login-error"
              className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm
                           focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-200"
                placeholder="you@wm.edu"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm
                           focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-200"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              aria-label="Sign In"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-800
                         px-4 py-2.5 text-sm font-semibold text-white shadow-sm
                         hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500
                         disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span
                    role="status"
                    aria-label="Signing in"
                    className="inline-block h-4 w-4 animate-spin rounded-full
                               border-2 border-white border-t-transparent"
                  />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
