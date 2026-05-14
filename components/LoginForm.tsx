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

      // Step 3 — get auth user info (role, id)
      const { user } = await res.json() as {
        user: {
          id?:      string;
          email?:   string;
          role?:    string;
          name?:    string;
          advisor?: string;
        };
      };

      // Step 4 — fetch full student profile from DB
      let dbStudent: {
        id?: string; name?: string; email?: string;
        major?: string; secondMajor?: string; minor?: string; concentration?: string;
        year?: number; catalogYear?: number;
      } = {};

      if (user?.id) {
        try {
          const profileRes = await fetch(`/api/student/${user.id}`);
          if (profileRes.ok) {
            const { student } = await profileRes.json();
            dbStudent = student ?? {};
          }
        } catch {
          // non-fatal — fall back to auth metadata
        }
      }

      setStudent({
        studentId:     dbStudent.id    ?? user?.id    ?? null,
        email:         dbStudent.email ?? user?.email ?? null,
        name:          dbStudent.name  ?? user?.name  ?? null,
        major:         dbStudent.major         ?? null,
        secondMajor:   dbStudent.secondMajor   ?? null,
        minor:         dbStudent.minor         ?? null,
        concentration: dbStudent.concentration ?? null,
        year:          dbStudent.year          ?? null,
        catalogYear:   dbStudent.catalogYear   ?? null,
        advisor:       user?.advisor ?? null,
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
    <div className="flex min-h-screen">

      {/* ── Left panel: branding ─────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0f3d24 0%, #1a5c38 55%, #236b43 100%)" }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-10"
             style={{ background: "radial-gradient(circle, #c8a951 0%, transparent 70%)" }} />
        <div className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full opacity-10"
             style={{ background: "radial-gradient(circle, #c8a951 0%, transparent 70%)" }} />

        {/* Logo + tagline */}
        <div className="relative z-10 flex flex-col items-center text-center px-12">
          {/* Icon */}
          <div className="mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" className="w-24 h-24">
              <circle cx="32" cy="28" r="22" fill="white" fillOpacity="0.12"/>
              <path d="M32 6 C20 6 10 16 10 27 C10 39 32 58 32 58 C32 58 54 39 54 27 C54 16 44 6 32 6Z" fill="white"/>
              <circle cx="32" cy="27" r="8" fill="#1a5c38"/>
              <circle cx="10" cy="56" r="3.5" fill="#c8a951"/>
              <circle cx="22" cy="60" r="2.5" fill="#c8a951" fillOpacity="0.65"/>
              <circle cx="42" cy="60" r="2.5" fill="#c8a951" fillOpacity="0.65"/>
              <circle cx="54" cy="56" r="3.5" fill="#c8a951"/>
              <line x1="13.5" y1="56" x2="19.5" y2="60" stroke="#c8a951" strokeWidth="1.5" strokeDasharray="2,2"/>
              <line x1="24.5" y1="60" x2="39.5" y2="60" stroke="#c8a951" strokeWidth="1.5" strokeDasharray="2,2"/>
              <line x1="44.5" y1="60" x2="50.5" y2="56" stroke="#c8a951" strokeWidth="1.5" strokeDasharray="2,2"/>
            </svg>
          </div>

          <h1 className="text-5xl font-bold text-white mb-1" style={{ fontFamily: "Georgia, serif" }}>
            Degree<span style={{ color: "#c8a951" }}>Map</span>
          </h1>
          <p className="mt-3 text-green-200 text-lg leading-relaxed max-w-xs">
            Plan your academic journey at<br />
            <span className="font-semibold text-white">William &amp; Mary</span>
          </p>

          {/* Feature pills */}
          <div className="mt-10 flex flex-col gap-3 w-full max-w-xs">
            {[
              { icon: "🗓", text: "Four-year course planner" },
              { icon: "📋", text: "Degree requirements tracker" },
              { icon: "✨", text: "AI academic advisor" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-3 rounded-xl px-4 py-3"
                   style={{ background: "rgba(255,255,255,0.08)" }}>
                <span className="text-xl">{icon}</span>
                <span className="text-sm text-green-100 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom attribution */}
        <p className="absolute bottom-6 text-green-400 text-xs">
          William &amp; Mary · Academic Advising
        </p>
      </div>

      {/* ── Right panel: login form ──────────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-gray-50">

        {/* Mobile-only header */}
        <div className="lg:hidden mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" className="w-8 h-8">
              <path d="M32 6 C20 6 10 16 10 27 C10 39 32 58 32 58 C32 58 54 39 54 27 C54 16 44 6 32 6Z" fill="#1a5c38"/>
              <circle cx="32" cy="27" r="8" fill="white"/>
            </svg>
            <span className="text-2xl font-bold text-green-900" style={{ fontFamily: "Georgia, serif" }}>
              Degree<span className="text-yellow-600">Map</span>
            </span>
          </div>
          <p className="text-sm text-gray-500">William &amp; Mary Academic Advising</p>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">Sign in with your W&amp;M email to continue</p>
          </div>

          {/* Card */}
          <div className="rounded-2xl bg-white px-8 py-8 shadow-sm ring-1 ring-gray-200">

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
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm
                             shadow-sm transition-colors
                             focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  placeholder="you@wm.edu"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm
                             shadow-sm transition-colors
                             focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                aria-label="Sign In"
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg
                           px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors
                           focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1
                           disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: loading ? "#1a5c38" : "linear-gradient(135deg, #1a5c38 0%, #236b43 100%)" }}
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

          <p className="mt-6 text-center text-xs text-gray-400">
            Access restricted to @wm.edu accounts
          </p>
        </div>
      </div>
    </div>
  );
}
