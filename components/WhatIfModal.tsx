// file: components/WhatIfModal.tsx
"use client";

import React from "react";
import { useWhatIfStore } from "@/lib/stores/whatIfStore";
import { MAJORS, MINORS, CONCENTRATIONS } from "@/lib/data/majors";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  /** The student's currently declared major (from Supabase user metadata). */
  declaredMajor?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WhatIfModal({ declaredMajor = "Undecided" }: Props) {
  const {
    open,
    active,
    major,
    minor,
    concentration,
    closeModal,
    activate,
    reset: resetWhatIf,
    setMajor,
    setMinor,
    setConcentration,
  } = useWhatIfStore();

  if (!open) return null;

  function handleMajorChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setMajor(e.target.value || null);
  }

  function handleMinorChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setMinor(e.target.value || null);
  }

  function handleConcentrationChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setConcentration(e.target.value || null);
  }

  function handleRunAnalysis() {
    activate();
  }

  function handleClearAnalysis() {
    resetWhatIf();
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
    >
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="what-if-title"
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200"
      >
        {/* Header */}
        <div className="border-b border-gray-100 px-6 py-4">
          <h2
            id="what-if-title"
            className="text-base font-semibold text-gray-900"
          >
            What-If Analysis
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Explore how a different program would affect your degree requirements.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Declared major display */}
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-100">
            Your declared major:{" "}
            <span className="font-semibold">{declaredMajor}</span>
          </div>

          {/* Major selector */}
          <div>
            <label
              htmlFor="what-if-major"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Major
            </label>
            <select
              id="what-if-major"
              value={major ?? ""}
              onChange={handleMajorChange}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
                         text-gray-800 shadow-sm focus:border-green-500 focus:outline-none
                         focus:ring-2 focus:ring-green-100"
            >
              <option value="">-- Select a major --</option>
              {MAJORS.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Minor selector */}
          <div>
            <label
              htmlFor="what-if-minor"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Minor
            </label>
            <select
              id="what-if-minor"
              value={minor ?? ""}
              onChange={handleMinorChange}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
                         text-gray-800 shadow-sm focus:border-green-500 focus:outline-none
                         focus:ring-2 focus:ring-green-100"
            >
              <option value="">None</option>
              {MINORS.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Concentration selector */}
          <div>
            <label
              htmlFor="what-if-concentration"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Concentration
            </label>
            <select
              id="what-if-concentration"
              value={concentration ?? ""}
              onChange={handleConcentrationChange}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
                         text-gray-800 shadow-sm focus:border-green-500 focus:outline-none
                         focus:ring-2 focus:ring-green-100"
            >
              <option value="">None</option>
              {CONCENTRATIONS.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          {/* Clear Analysis — only shown when a what-if is already active */}
          {active ? (
            <button
              onClick={handleClearAnalysis}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium
                         text-red-600 hover:bg-red-50 transition-colors"
            >
              Clear Analysis
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button
              onClick={closeModal}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium
                         text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRunAnalysis}
              className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white
                         shadow-sm hover:bg-green-700 transition-colors"
            >
              Run Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
