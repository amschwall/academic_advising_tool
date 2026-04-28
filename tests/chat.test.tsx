// file: tests/chat.test.tsx

/**
 * Phase 17 — AI Chat Interface: component tests
 *
 * Tests for:
 *   components/ChatPanel.tsx        — conversational sidebar / standalone panel
 *   app/chat/page.tsx               — dedicated /chat page (renders ChatPanel)
 *   app/api/chat/route.ts           — POST endpoint (called via mocked fetch)
 *
 * Architecture assumptions (what we are testing against):
 *
 *   ChatPanel props:
 *     courseCatalog?: { code: string; title: string; credits: number }[]
 *       — known courses; only codes matching this list get recommendation cards
 *     completedCourses?: PlannedCourse[]
 *       — courses the student has already completed (sent as context)
 *     transferCourses?: PlannedCourse[]
 *       — AP / transfer credits (sent as context)
 *
 *   POST /api/chat body:
 *     { messages: ChatMessage[], context: { plannedCourses, completedCourses, transferCourses } }
 *
 *   Response: Server-Sent Events (text/event-stream)
 *     Each line: `data: <json>\n\n`
 *     Delta event:  { text: "<chunk>" }
 *     Done event:   { done: true }
 *
 *   data-testid contracts:
 *     "chat-message-list"          — the scrollable message container
 *     "chat-message-user-{n}"      — nth user message bubble (0-indexed)
 *     "chat-message-assistant-{n}" — nth assistant message bubble (0-indexed)
 *     "chat-typing-indicator"      — animated dots shown while streaming
 *     "chat-error"                 — error banner
 *     "chat-input"                 — text input field
 *     "chat-send"                  — send button
 *     "chat-rec-card-{CODE}"       — draggable recommendation card for CODE
 *     "chat-clear"                 — optional reset-conversation button
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";

import { ChatPanel } from "@/components/ChatPanel";
import { useChatStore } from "@/lib/stores/chatStore";
import { usePlannerStore, type PlannedCourse } from "@/lib/stores/plannerStore";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal catalog used across all card tests. */
const CATALOG = [
  { code: "CSCI141", title: "Intro to CS",         credits: 4 },
  { code: "CSCI303", title: "Data Structures",      credits: 4 },
  { code: "MATH211", title: "Calculus I",           credits: 4 },
  { code: "HIST101", title: "US History to 1865",   credits: 3 },
];

function makeCourse(overrides: Partial<PlannedCourse> & { code: string }): PlannedCourse {
  return {
    title: "Test Course",
    credits: 3,
    prerequisiteCodes: [],
    sections: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SSE stream helpers
// ---------------------------------------------------------------------------

/** Encode one SSE delta frame. Buffer extends Uint8Array, no TextEncoder needed. */
function encodeChunk(text: string): Uint8Array {
  return Buffer.from(`data: ${JSON.stringify({ text })}\n\n`);
}

/** Encode the terminal SSE frame. */
function encodeDone(): Uint8Array {
  return Buffer.from(`data: ${JSON.stringify({ done: true })}\n\n`);
}

/** Build a ReadableStream that emits the given text chunks then a done frame. */
function makeSSEStream(textChunks: string[]): ReadableStream<Uint8Array> {
  const frames = [...textChunks.map(encodeChunk), encodeDone()];
  return new ReadableStream({
    start(controller) {
      frames.forEach((f) => controller.enqueue(f));
      controller.close();
    },
  });
}

/** Mock fetch to return a successful SSE stream with the given text chunks. */
function mockStreamFetch(textChunks: string[]): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    body: makeSSEStream(textChunks),
  } as unknown as Response);
}

/** Mock fetch to return a server error. */
function mockErrorFetch(status = 500): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    body: null,
  } as unknown as Response);
}

/** Mock fetch to reject entirely (network failure). */
function mockNetworkError(): void {
  (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

/** Render ChatPanel inside DndContext (required for draggable cards). */
function renderChat(
  props: Partial<React.ComponentProps<typeof ChatPanel>> = {},
) {
  return render(
    <DndContext>
      <ChatPanel courseCatalog={CATALOG} {...props} />
    </DndContext>,
  );
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  useChatStore.getState().reset();
  usePlannerStore.getState().reset();
  // jsdom doesn't pre-define fetch; assign a fresh mock each test.
  global.fetch = jest.fn(() =>
    Promise.reject(new Error("fetch: not mocked for this test")),
  ) as jest.Mock;
});

afterEach(() => {
  jest.resetAllMocks();
});

// ===========================================================================
// A. Initial render
// ===========================================================================

describe("ChatPanel – initial render", () => {
  it("renders the chat panel container", () => {
    renderChat();
    expect(screen.getByTestId("chat-message-list")).toBeInTheDocument();
  });

  it("shows an empty-state prompt when there are no messages", () => {
    renderChat();
    // Some 'Ask your advisor…' or 'Start a conversation' text
    expect(
      screen.getByText(/ask|start a conversation|how can i help/i),
    ).toBeInTheDocument();
  });

  it("renders the message input field", () => {
    renderChat();
    expect(screen.getByTestId("chat-input")).toBeInTheDocument();
  });

  it("input field accepts text", async () => {
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    expect(screen.getByTestId("chat-input")).toHaveValue("Hello");
  });

  it("renders the send button", () => {
    renderChat();
    expect(screen.getByTestId("chat-send")).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    renderChat();
    expect(screen.getByTestId("chat-send")).toBeDisabled();
  });

  it("send button is enabled when input has non-whitespace text", async () => {
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    expect(screen.getByTestId("chat-send")).toBeEnabled();
  });

  it("does not show a typing indicator on initial render", () => {
    renderChat();
    expect(screen.queryByTestId("chat-typing-indicator")).not.toBeInTheDocument();
  });

  it("does not show an error banner on initial render", () => {
    renderChat();
    expect(screen.queryByTestId("chat-error")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// B. Sending a message
// ===========================================================================

describe("ChatPanel – sending a message", () => {
  it("user message appears in the chat after clicking send", async () => {
    mockStreamFetch(["Hi!"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "What courses should I take?");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    expect(screen.getByTestId("chat-message-user-0")).toHaveTextContent(
      "What courses should I take?",
    );
  });

  it("input clears after sending", async () => {
    mockStreamFetch(["Response"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    expect(screen.getByTestId("chat-input")).toHaveValue("");
  });

  it("sends on Enter key press", async () => {
    mockStreamFetch(["Response"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello{Enter}");
    expect(global.fetch).toHaveBeenCalled();
  });

  it("does not send when input is whitespace only", async () => {
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "   ");
    await userEvent.click(screen.getByTestId("chat-send"));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls POST /api/chat", async () => {
    mockStreamFetch(["Response"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fetch body contains the user message", async () => {
    mockStreamFetch(["Response"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Tell me about CS");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Tell me about CS" }),
      ]),
    );
  });

  it("send button is disabled while loading", async () => {
    // Fetch never resolves → always loading
    (global.fetch as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    expect(screen.getByTestId("chat-send")).toBeDisabled();
  });

  it("input is disabled while loading", async () => {
    (global.fetch as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    expect(screen.getByTestId("chat-input")).toBeDisabled();
  });
});

// ===========================================================================
// C. Streaming responses
// ===========================================================================

describe("ChatPanel – streaming responses", () => {
  it("shows a typing indicator while the response is in flight", async () => {
    (global.fetch as jest.Mock).mockReturnValueOnce(new Promise(() => {})); // never resolves
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    expect(screen.getByTestId("chat-typing-indicator")).toBeInTheDocument();
  });

  it("displays the full assistant message after stream ends", async () => {
    mockStreamFetch(["Great ", "question!"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-0")).toHaveTextContent(
        "Great question!",
      ),
    );
  });

  it("hides the typing indicator after streaming completes", async () => {
    mockStreamFetch(["Done!"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("chat-typing-indicator")).not.toBeInTheDocument(),
    );
  });

  it("re-enables the send button after streaming completes", async () => {
    mockStreamFetch(["Done!"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      // Input is empty so button goes back to disabled-by-emptiness, not loading
      expect(screen.getByTestId("chat-send")).toBeDisabled(),
    );
    // Type something — now it should be enabled (not stuck in loading)
    await userEvent.type(screen.getByTestId("chat-input"), "Second");
    expect(screen.getByTestId("chat-send")).toBeEnabled();
  });

  it("assigns correct test-ids to user and assistant messages in order", async () => {
    mockStreamFetch(["Reply 1"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Message 1");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-0")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("chat-message-user-0")).toHaveTextContent("Message 1");
    expect(screen.getByTestId("chat-message-assistant-0")).toHaveTextContent("Reply 1");
  });

  it("increments message indexes across multiple turns", async () => {
    mockStreamFetch(["First reply"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Turn 1");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-0")).toBeInTheDocument(),
    );

    mockStreamFetch(["Second reply"]);
    await userEvent.type(screen.getByTestId("chat-input"), "Turn 2");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-1")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("chat-message-user-1")).toHaveTextContent("Turn 2");
  });
});

// ===========================================================================
// D. Recommendation cards
// ===========================================================================

describe("ChatPanel – recommendation cards", () => {
  it("shows no recommendation cards for plain text responses", async () => {
    mockStreamFetch(["Consider taking more mathematics this semester."]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "What should I take?");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-0")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId(/^chat-rec-card-/)).not.toBeInTheDocument();
  });

  it("shows a recommendation card when response contains a catalog course code", async () => {
    mockStreamFetch(["I recommend CSCI303 for data structures."]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Recommend a course");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-rec-card-CSCI303")).toBeInTheDocument(),
    );
  });

  it("shows multiple cards for multiple distinct catalog codes in one response", async () => {
    mockStreamFetch(["Try CSCI141 and also MATH211."]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Recommend courses");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("chat-rec-card-CSCI141")).toBeInTheDocument();
      expect(screen.getByTestId("chat-rec-card-MATH211")).toBeInTheDocument();
    });
  });

  it("does NOT show a card for a course code absent from the catalog", async () => {
    mockStreamFetch(["Consider FAKE999 if you like fiction courses."]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Recommend a course");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-0")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("chat-rec-card-FAKE999")).not.toBeInTheDocument();
  });

  it("recommendation card displays the course code", async () => {
    mockStreamFetch(["I recommend CSCI303."]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Recommend a course");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() => {
      const card = screen.getByTestId("chat-rec-card-CSCI303");
      expect(card).toHaveTextContent("CSCI303");
    });
  });

  it("recommendation card displays the course title from the catalog", async () => {
    mockStreamFetch(["I recommend CSCI303."]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Recommend a course");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() => {
      const card = screen.getByTestId("chat-rec-card-CSCI303");
      expect(card).toHaveTextContent("Data Structures");
    });
  });

  it("recommendation card is draggable (has a non-negative tabIndex from dnd-kit)", async () => {
    mockStreamFetch(["Take CSCI141 to get started."]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Recommend a course");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() => {
      const card = screen.getByTestId("chat-rec-card-CSCI141");
      // dnd-kit's useDraggable spreads tabIndex="0" onto the element
      expect(card).toHaveAttribute("tabindex", "0");
    });
  });

  it("does not duplicate a card when the same code appears multiple times in one response", async () => {
    mockStreamFetch(["CSCI303 is great. Did I mention CSCI303?"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Tell me twice");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-rec-card-CSCI303")).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("chat-rec-card-CSCI303")).toHaveLength(1);
  });

  it("shows no cards when courseCatalog prop is empty", async () => {
    mockStreamFetch(["Consider CSCI303 and MATH211."]);
    render(
      <DndContext>
        <ChatPanel courseCatalog={[]} />
      </DndContext>,
    );
    await userEvent.type(screen.getByTestId("chat-input"), "Recommend");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-0")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId(/^chat-rec-card-/)).not.toBeInTheDocument();
  });

  it("recommendation card displays the credit count from the catalog", async () => {
    mockStreamFetch(["HIST101 is a great course."]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "History recommendation");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() => {
      const card = screen.getByTestId("chat-rec-card-HIST101");
      expect(card).toHaveTextContent("3"); // 3 credits
    });
  });
});

// ===========================================================================
// E. Error states
// ===========================================================================

describe("ChatPanel – error states", () => {
  it("shows an error banner when fetch rejects (network failure)", async () => {
    mockNetworkError();
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-error")).toBeInTheDocument(),
    );
  });

  it("shows an error banner when server returns a non-ok status", async () => {
    mockErrorFetch(500);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-error")).toBeInTheDocument(),
    );
  });

  it("re-enables the input after an error so the user can retry", async () => {
    mockNetworkError();
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("chat-input")).not.toBeDisabled();
  });

  it("clears the error banner when the user sends a new successful message", async () => {
    mockNetworkError();
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-error")).toBeInTheDocument(),
    );

    // Second attempt succeeds
    mockStreamFetch(["I'm back!"]);
    await userEvent.type(screen.getByTestId("chat-input"), "Retry");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("chat-error")).not.toBeInTheDocument(),
    );
  });

  it("does not add an assistant message bubble on error", async () => {
    mockNetworkError();
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-error")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("chat-message-assistant-0")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// F. Conversation history and context
// ===========================================================================

describe("ChatPanel – conversation history and context", () => {
  it("sends full conversation history on the second turn", async () => {
    // Turn 1
    mockStreamFetch(["First reply"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "First question");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-0")).toBeInTheDocument(),
    );

    // Turn 2
    mockStreamFetch(["Second reply"]);
    await userEvent.type(screen.getByTestId("chat-input"), "Second question");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });

    const secondCall = (global.fetch as jest.Mock).mock.calls[1];
    const body = JSON.parse(secondCall[1].body as string);
    expect(body.messages).toHaveLength(3); // user, assistant, user
    expect(body.messages[0]).toMatchObject({ role: "user",      content: "First question" });
    expect(body.messages[1]).toMatchObject({ role: "assistant", content: "First reply" });
    expect(body.messages[2]).toMatchObject({ role: "user",      content: "Second question" });
  });

  it("includes current planner courses in the fetch context", async () => {
    act(() => {
      usePlannerStore.getState().addCourse(
        "year1-fall",
        makeCourse({ code: "CSCI141", title: "Intro to CS", credits: 4 }),
      );
    });
    mockStreamFetch(["Response"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "What should I take next?");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.context.plannedCourses).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "CSCI141" })]),
    );
  });

  it("includes completedCourses in the fetch context", async () => {
    const completed = [makeCourse({ code: "MATH211", title: "Calculus I", credits: 4 })];
    mockStreamFetch(["Response"]);
    renderChat({ completedCourses: completed });
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.context.completedCourses).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MATH211" })]),
    );
  });

  it("includes transferCourses in the fetch context", async () => {
    const transfer = [makeCourse({ code: "HIST101", title: "US History", credits: 3 })];
    mockStreamFetch(["Response"]);
    renderChat({ transferCourses: transfer });
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.context.transferCourses).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "HIST101" })]),
    );
  });

  it("sends Content-Type: application/json header", async () => {
    mockStreamFetch(["Response"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });
});

// ===========================================================================
// G. Clear / reset conversation
// ===========================================================================

describe("ChatPanel – clear conversation", () => {
  it("renders a clear-conversation button after at least one message", async () => {
    mockStreamFetch(["Hi!"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-user-0")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("chat-clear")).toBeInTheDocument();
  });

  it("clears all messages when the clear button is clicked", async () => {
    mockStreamFetch(["Response"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-0")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("chat-clear"));
    expect(screen.queryByTestId("chat-message-user-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-message-assistant-0")).not.toBeInTheDocument();
  });

  it("shows the empty-state prompt again after clearing", async () => {
    mockStreamFetch(["Response"]);
    renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await act(async () => {
      await userEvent.click(screen.getByTestId("chat-send"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-user-0")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("chat-clear"));
    expect(
      screen.getByText(/ask|start a conversation|how can i help/i),
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// H. /chat page route
// ===========================================================================

describe("/chat page", () => {
  it("renders a ChatPanel component", async () => {
    // Dynamic import to avoid Next.js server-component issues in jsdom
    const { default: ChatPage } = await import("@/app/chat/page");
    render(
      <DndContext>
        <ChatPage />
      </DndContext>,
    );
    expect(screen.getByTestId("chat-message-list")).toBeInTheDocument();
  });

  it("page has a visible heading", async () => {
    const { default: ChatPage } = await import("@/app/chat/page");
    render(
      <DndContext>
        <ChatPage />
      </DndContext>,
    );
    expect(
      screen.getByRole("heading", { name: /advisor|chat|ask/i }),
    ).toBeInTheDocument();
  });
});
