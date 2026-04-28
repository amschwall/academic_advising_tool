// file: tests/what-if-store.test.ts

/**
 * Phase 16 — What-If Analysis: Zustand store
 *
 * Tests for lib/stores/whatIfStore.ts
 *
 * The what-if store holds ephemeral (per-session, not persisted) state for the
 * "What-If Analysis" feature:
 *   - open:          Whether the What-If modal is currently open
 *   - active:        Whether a what-if analysis is running (user clicked "Run Analysis")
 *   - major:         The major being explored (string | null)
 *   - minor:         The minor being explored (string | null)
 *   - concentration: The concentration being explored (string | null)
 *
 * Key invariants:
 *   - activate() sets active=true and closes the modal (open=false)
 *   - deactivate() sets active=false but does NOT clear selections
 *   - closeModal() does NOT clear selections or deactivate
 *   - reset() clears everything: active=false, open=false, all selections null
 */

import { useWhatIfStore } from "@/lib/stores/whatIfStore";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useWhatIfStore.getState().reset();
});

// ===========================================================================
// 1. INITIAL STATE
// ===========================================================================

describe("whatIfStore – initial state", () => {
  it("active is false by default", () => {
    expect(useWhatIfStore.getState().active).toBe(false);
  });

  it("open (modal) is false by default", () => {
    expect(useWhatIfStore.getState().open).toBe(false);
  });

  it("major is null by default", () => {
    expect(useWhatIfStore.getState().major).toBeNull();
  });

  it("minor is null by default", () => {
    expect(useWhatIfStore.getState().minor).toBeNull();
  });

  it("concentration is null by default", () => {
    expect(useWhatIfStore.getState().concentration).toBeNull();
  });
});

// ===========================================================================
// 2. MODAL OPEN / CLOSE
// ===========================================================================

describe("whatIfStore – modal open / close", () => {
  it("openModal() sets open to true", () => {
    useWhatIfStore.getState().openModal();
    expect(useWhatIfStore.getState().open).toBe(true);
  });

  it("closeModal() sets open to false", () => {
    useWhatIfStore.getState().openModal();
    useWhatIfStore.getState().closeModal();
    expect(useWhatIfStore.getState().open).toBe(false);
  });

  it("closeModal() does not clear the major selection", () => {
    useWhatIfStore.getState().setMajor("Computer Science");
    useWhatIfStore.getState().openModal();
    useWhatIfStore.getState().closeModal();
    expect(useWhatIfStore.getState().major).toBe("Computer Science");
  });

  it("closeModal() does not deactivate an active analysis", () => {
    useWhatIfStore.getState().setMajor("Computer Science");
    useWhatIfStore.getState().activate();
    useWhatIfStore.getState().openModal();
    useWhatIfStore.getState().closeModal();
    expect(useWhatIfStore.getState().active).toBe(true);
  });
});

// ===========================================================================
// 3. ACTIVATE / DEACTIVATE
// ===========================================================================

describe("whatIfStore – activate / deactivate", () => {
  it("activate() sets active to true", () => {
    useWhatIfStore.getState().activate();
    expect(useWhatIfStore.getState().active).toBe(true);
  });

  it("activate() also closes the modal", () => {
    useWhatIfStore.getState().openModal();
    useWhatIfStore.getState().activate();
    expect(useWhatIfStore.getState().open).toBe(false);
  });

  it("deactivate() sets active to false", () => {
    useWhatIfStore.getState().activate();
    useWhatIfStore.getState().deactivate();
    expect(useWhatIfStore.getState().active).toBe(false);
  });

  it("deactivate() does not clear the major selection", () => {
    useWhatIfStore.getState().setMajor("Computer Science");
    useWhatIfStore.getState().activate();
    useWhatIfStore.getState().deactivate();
    expect(useWhatIfStore.getState().major).toBe("Computer Science");
  });

  it("deactivate() does not clear the minor selection", () => {
    useWhatIfStore.getState().setMinor("History");
    useWhatIfStore.getState().activate();
    useWhatIfStore.getState().deactivate();
    expect(useWhatIfStore.getState().minor).toBe("History");
  });
});

// ===========================================================================
// 4. SELECTIONS
// ===========================================================================

describe("whatIfStore – selections", () => {
  it("setMajor() sets the major", () => {
    useWhatIfStore.getState().setMajor("Computer Science");
    expect(useWhatIfStore.getState().major).toBe("Computer Science");
  });

  it("setMajor(null) clears the major", () => {
    useWhatIfStore.getState().setMajor("Computer Science");
    useWhatIfStore.getState().setMajor(null);
    expect(useWhatIfStore.getState().major).toBeNull();
  });

  it("setMinor() sets the minor", () => {
    useWhatIfStore.getState().setMinor("History");
    expect(useWhatIfStore.getState().minor).toBe("History");
  });

  it("setMinor(null) clears the minor", () => {
    useWhatIfStore.getState().setMinor("History");
    useWhatIfStore.getState().setMinor(null);
    expect(useWhatIfStore.getState().minor).toBeNull();
  });

  it("setConcentration() sets the concentration", () => {
    useWhatIfStore.getState().setConcentration("Data Science");
    expect(useWhatIfStore.getState().concentration).toBe("Data Science");
  });

  it("setConcentration(null) clears the concentration", () => {
    useWhatIfStore.getState().setConcentration("Data Science");
    useWhatIfStore.getState().setConcentration(null);
    expect(useWhatIfStore.getState().concentration).toBeNull();
  });

  it("major, minor, and concentration are independent selections", () => {
    useWhatIfStore.getState().setMajor("Computer Science");
    useWhatIfStore.getState().setMinor("History");
    useWhatIfStore.getState().setConcentration("Data Science");

    const state = useWhatIfStore.getState();
    expect(state.major).toBe("Computer Science");
    expect(state.minor).toBe("History");
    expect(state.concentration).toBe("Data Science");
  });

  it("changing major does not affect minor or concentration", () => {
    useWhatIfStore.getState().setMajor("Computer Science");
    useWhatIfStore.getState().setMinor("History");
    useWhatIfStore.getState().setMajor("Economics");

    expect(useWhatIfStore.getState().minor).toBe("History");
    expect(useWhatIfStore.getState().concentration).toBeNull();
  });
});

// ===========================================================================
// 5. RESET
// ===========================================================================

describe("whatIfStore – reset", () => {
  it("reset() sets active to false", () => {
    useWhatIfStore.getState().activate();
    useWhatIfStore.getState().reset();
    expect(useWhatIfStore.getState().active).toBe(false);
  });

  it("reset() sets open to false", () => {
    useWhatIfStore.getState().openModal();
    useWhatIfStore.getState().reset();
    expect(useWhatIfStore.getState().open).toBe(false);
  });

  it("reset() clears major", () => {
    useWhatIfStore.getState().setMajor("Computer Science");
    useWhatIfStore.getState().reset();
    expect(useWhatIfStore.getState().major).toBeNull();
  });

  it("reset() clears minor", () => {
    useWhatIfStore.getState().setMinor("History");
    useWhatIfStore.getState().reset();
    expect(useWhatIfStore.getState().minor).toBeNull();
  });

  it("reset() clears concentration", () => {
    useWhatIfStore.getState().setConcentration("Data Science");
    useWhatIfStore.getState().reset();
    expect(useWhatIfStore.getState().concentration).toBeNull();
  });
});
