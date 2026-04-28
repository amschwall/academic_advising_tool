// file: tests/chat-store.test.ts

/**
 * Phase 17 — AI Chat Interface: chatStore unit tests
 *
 * Tests for: lib/stores/chatStore.ts
 *
 * New store shape:
 *   messages: ChatMessage[]        — ephemeral conversation history
 *   isLoading: boolean             — true while waiting for/streaming a response
 *   error: string | null           — last error message, null when healthy
 *
 * Actions:
 *   addMessage(msg)    — appends a message
 *   updateLastAssistantMessage(text) — replaces content of last assistant message (streaming)
 *   setLoading(b)      — flip loading flag
 *   setError(msg)      — set/clear the error string
 *   reset()            — clear all state back to defaults
 */

import { useChatStore, type ChatMessage } from "@/lib/stores/chatStore";

// ── Helpers ─────────────────────────────────────────────────────────────────

function store() {
  return useChatStore.getState();
}

function userMsg(content: string): ChatMessage {
  return { role: "user", content };
}

function assistantMsg(content: string): ChatMessage {
  return { role: "assistant", content };
}

// ── Reset between tests ──────────────────────────────────────────────────────

beforeEach(() => {
  store().reset();
});

// ===========================================================================
// A. Initial state
// ===========================================================================

describe("chatStore – initial state", () => {
  it("starts with an empty messages array", () => {
    expect(store().messages).toEqual([]);
  });

  it("starts with isLoading = false", () => {
    expect(store().isLoading).toBe(false);
  });

  it("starts with error = null", () => {
    expect(store().error).toBeNull();
  });
});

// ===========================================================================
// B. addMessage
// ===========================================================================

describe("chatStore – addMessage", () => {
  it("adds a user message to the messages array", () => {
    store().addMessage(userMsg("Hello"));
    expect(store().messages).toHaveLength(1);
    expect(store().messages[0]).toMatchObject({ role: "user", content: "Hello" });
  });

  it("adds an assistant message to the messages array", () => {
    store().addMessage(assistantMsg("Hi there!"));
    expect(store().messages[0]).toMatchObject({ role: "assistant", content: "Hi there!" });
  });

  it("appends messages in order", () => {
    store().addMessage(userMsg("First"));
    store().addMessage(assistantMsg("Second"));
    store().addMessage(userMsg("Third"));
    const msgs = store().messages;
    expect(msgs[0].content).toBe("First");
    expect(msgs[1].content).toBe("Second");
    expect(msgs[2].content).toBe("Third");
  });

  it("does not mutate existing messages", () => {
    store().addMessage(userMsg("A"));
    const before = store().messages;
    store().addMessage(userMsg("B"));
    // original reference must not have changed
    expect(before).toHaveLength(1);
  });
});

// ===========================================================================
// C. updateLastAssistantMessage  (used during streaming)
// ===========================================================================

describe("chatStore – updateLastAssistantMessage", () => {
  it("replaces the content of the last assistant message", () => {
    store().addMessage(userMsg("Hello"));
    store().addMessage(assistantMsg(""));        // placeholder added at stream start
    store().updateLastAssistantMessage("Done!");
    expect(store().messages[1].content).toBe("Done!");
  });

  it("accumulates content across multiple streaming calls", () => {
    store().addMessage(userMsg("Hello"));
    store().addMessage(assistantMsg(""));
    store().updateLastAssistantMessage("Hello");
    store().updateLastAssistantMessage("Hello world");
    expect(store().messages[1].content).toBe("Hello world");
  });

  it("does not affect user messages", () => {
    store().addMessage(userMsg("Hello"));
    store().addMessage(assistantMsg("Old"));
    store().updateLastAssistantMessage("New");
    expect(store().messages[0]).toMatchObject({ role: "user", content: "Hello" });
  });

  it("only modifies the last assistant message, not earlier ones", () => {
    store().addMessage(userMsg("Q1"));
    store().addMessage(assistantMsg("A1"));
    store().addMessage(userMsg("Q2"));
    store().addMessage(assistantMsg(""));
    store().updateLastAssistantMessage("A2 done");
    expect(store().messages[1].content).toBe("A1");
    expect(store().messages[3].content).toBe("A2 done");
  });

  it("is a no-op when there are no assistant messages", () => {
    store().addMessage(userMsg("Only user"));
    expect(() => store().updateLastAssistantMessage("x")).not.toThrow();
    // User message must be unchanged
    expect(store().messages[0].content).toBe("Only user");
  });
});

// ===========================================================================
// D. setLoading
// ===========================================================================

describe("chatStore – setLoading", () => {
  it("sets isLoading to true", () => {
    store().setLoading(true);
    expect(store().isLoading).toBe(true);
  });

  it("sets isLoading back to false", () => {
    store().setLoading(true);
    store().setLoading(false);
    expect(store().isLoading).toBe(false);
  });
});

// ===========================================================================
// E. setError
// ===========================================================================

describe("chatStore – setError", () => {
  it("sets the error string", () => {
    store().setError("Something went wrong");
    expect(store().error).toBe("Something went wrong");
  });

  it("clears the error with null", () => {
    store().setError("Oops");
    store().setError(null);
    expect(store().error).toBeNull();
  });
});

// ===========================================================================
// F. reset
// ===========================================================================

describe("chatStore – reset", () => {
  it("clears all messages", () => {
    store().addMessage(userMsg("Hello"));
    store().addMessage(assistantMsg("Hi"));
    store().reset();
    expect(store().messages).toEqual([]);
  });

  it("clears isLoading", () => {
    store().setLoading(true);
    store().reset();
    expect(store().isLoading).toBe(false);
  });

  it("clears error", () => {
    store().setError("Broken");
    store().reset();
    expect(store().error).toBeNull();
  });
});
