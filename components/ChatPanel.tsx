// file: components/ChatPanel.tsx
"use client";

import React, { useRef, useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useChatStore, type ChatMessage } from "@/lib/stores/chatStore";
import { usePlannerStore, type PlannedCourse } from "@/lib/stores/plannerStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  code: string;
  title: string;
  credits: number;
}

interface Props {
  /** Courses in the W&M catalog; only codes found here get recommendation cards. */
  courseCatalog?: CatalogEntry[];
  /** Courses the student has already completed. */
  completedCourses?: PlannedCourse[];
  /** AP / transfer credits. */
  transferCourses?: PlannedCourse[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract unique catalog course codes mentioned in `text`. */
function extractRecommendations(text: string, catalog: CatalogEntry[]): CatalogEntry[] {
  const catalogMap = new Map(catalog.map((c) => [c.code, c]));
  const seen = new Set<string>();
  const results: CatalogEntry[] = [];
  // Match patterns like CSCI303, DATA101, GOVT340A
  const re = /\b([A-Z]{2,4}\d{3,4}[A-Z]?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const code = m[1];
    if (!seen.has(code) && catalogMap.has(code)) {
      seen.add(code);
      results.push(catalogMap.get(code)!);
    }
  }
  return results;
}

/** Consume an SSE ReadableStream, calling `onChunk` with the accumulated text. */
async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  onChunk: (accumulated: string) => void,
): Promise<string> {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer      = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep any incomplete trailing line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const raw = trimmed.slice(6).trim();
      if (!raw) continue;

      let parsed: { text?: string; done?: boolean };
      try { parsed = JSON.parse(raw); } catch { continue; }

      if (parsed.done) return accumulated;
      if (typeof parsed.text === "string") {
        accumulated += parsed.text;
        onChunk(accumulated);
      }
    }
  }
  return accumulated;
}

// ---------------------------------------------------------------------------
// RecommendationCard — draggable via dnd-kit
// ---------------------------------------------------------------------------

function RecommendationCard({ course }: { course: CatalogEntry }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chat-rec-${course.code}`,
    data: {
      code:              course.code,
      title:             course.title,
      credits:           course.credits,
      prerequisiteCodes: [],
      sections:          [],
    } satisfies PlannedCourse,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={`chat-rec-card-${course.code}`}
      className={[
        "flex cursor-grab select-none items-center justify-between rounded-xl",
        "border border-gray-200 bg-white px-3 py-2 shadow-sm transition-all",
        "active:cursor-grabbing hover:border-green-300 hover:shadow-md",
        isDragging ? "opacity-40 ring-2 ring-green-400" : "",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">{course.code}</p>
        <p className="truncate text-xs text-gray-500">{course.title}</p>
      </div>
      <span className="ml-3 shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
        {course.credits} cr
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TypingIndicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div data-testid="chat-typing-indicator" className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-gray-400"
          style={{ animation: `bounce 1.2s ${i * 0.2}s infinite ease-in-out` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChatPanel({
  courseCatalog    = [],
  completedCourses = [],
  transferCourses  = [],
}: Props) {
  const [input, setInput] = React.useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Store subscriptions ────────────────────────────────────────────────────
  const messages  = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const error     = useChatStore((s) => s.error);

  const {
    addMessage,
    updateLastAssistantMessage,
    setLoading,
    setError,
    reset,
  } = useChatStore.getState();

  const semesters     = usePlannerStore((s) => s.semesters);
  const plannedCourses = semesters.flatMap((s) => s.courses);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── Send handler ───────────────────────────────────────────────────────────
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // Build the new messages array synchronously before clearing input
    const nextMessages: ChatMessage[] = [
      ...useChatStore.getState().messages,
      { role: "user", content: trimmed },
    ];

    setError(null);
    addMessage({ role: "user", content: trimmed });
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          context: { plannedCourses, completedCourses, transferCourses },
        }),
      });

      if (!res.ok) {
        throw new Error(`Server error ${res.status}`);
      }

      // Add an empty placeholder for the assistant response, then stream into it
      addMessage({ role: "assistant", content: "" });

      await consumeSSE(res.body!, (accumulated) => {
        updateLastAssistantMessage(accumulated);
      });
    } catch (err) {
      // Remove the empty assistant placeholder if one was added
      const { messages: current } = useChatStore.getState();
      if (current.length > 0 && current[current.length - 1].role === "assistant" &&
          current[current.length - 1].content === "") {
        // Replace via reset + re-add everything except the empty placeholder
        useChatStore.setState({
          messages: current.slice(0, -1),
        });
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Compute per-role indexes for testids ────────────────────────────────────
  let userCount      = 0;
  let assistantCount = 0;
  const indexedMessages = messages.map((msg) => {
    const roleIndex = msg.role === "user" ? userCount++ : assistantCount++;
    return { ...msg, roleIndex };
  });

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col bg-white">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-semibold text-gray-800">AI Academic Advisor</p>
        {messages.length > 0 && (
          <button
            data-testid="chat-clear"
            onClick={reset}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500
                       hover:border-red-200 hover:text-red-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Message list ──────────────────────────────────────────────────── */}
      <div
        data-testid="chat-message-list"
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {isEmpty && !isLoading && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-gray-400">
              Ask your academic advisor anything — courses, majors, requirements, and more.
            </p>
          </div>
        )}

        {indexedMessages.map(({ role, content, roleIndex }, arrayIndex) => {
          const recs = role === "assistant"
            ? extractRecommendations(content, courseCatalog)
            : [];

          return (
            <div key={arrayIndex} className={role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className="max-w-[85%] space-y-2">
                {/* Message bubble */}
                <div
                  data-testid={`chat-message-${role}-${roleIndex}`}
                  className={[
                    "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    role === "user"
                      ? "bg-green-800 text-white rounded-br-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm",
                  ].join(" ")}
                >
                  {content}
                </div>

                {/* Recommendation cards below assistant message */}
                {recs.length > 0 && (
                  <div className="space-y-2 pl-1">
                    {recs.map((course) => (
                      <RecommendationCard key={course.code} course={course} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2">
              <TypingIndicator />
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            data-testid="chat-error"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input row ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-gray-100 px-4 py-3">
        <div className="flex gap-2">
          <input
            data-testid="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask about courses, majors, requirements…"
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5
                       text-sm text-gray-800 placeholder-gray-400 transition-colors
                       focus:border-green-500 focus:bg-white focus:outline-none
                       focus:ring-2 focus:ring-green-100 disabled:opacity-50"
          />
          <button
            data-testid="chat-send"
            onClick={handleSend}
            disabled={isLoading || input.trim() === ""}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                       bg-green-800 text-white shadow-sm transition-colors
                       hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
