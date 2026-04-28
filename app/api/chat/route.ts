// file: app/api/chat/route.ts
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CourseContext {
  code: string;
  title: string;
  credits: number;
}

interface RequestBody {
  messages: ChatMessage[];
  context?: {
    plannedCourses?:   CourseContext[];
    completedCourses?: CourseContext[];
    transferCourses?:  CourseContext[];
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are an academic advisor at William & Mary (W&M). " +
  "Your role is to help students choose courses and declare majors that align with " +
  "their interests, goals, and degree requirements.\n\n" +
  "When a student's query is too vague to give specific recommendations, ask one " +
  "clarifying question before proceeding.\n\n" +
  "When the query is specific enough, recommend relevant courses and suggest majors. " +
  "Always include the course code (e.g. CSCI303, MATH211) when mentioning a specific " +
  "course so the student can identify it in their planner. Keep responses concise.";

// ---------------------------------------------------------------------------
// Build context note appended to the first user turn
// ---------------------------------------------------------------------------

function buildContextNote(ctx: RequestBody["context"]): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.completedCourses?.length) {
    lines.push(
      "Completed: " + ctx.completedCourses.map((c) => `${c.code} ${c.title}`).join(", "),
    );
  }
  if (ctx.transferCourses?.length) {
    lines.push(
      "Transfer/AP: " + ctx.transferCourses.map((c) => `${c.code} ${c.title}`).join(", "),
    );
  }
  if (ctx.plannedCourses?.length) {
    lines.push(
      "Currently planned: " + ctx.plannedCourses.map((c) => `${c.code} ${c.title}`).join(", "),
    );
  }
  return lines.length ? "\n\n[Student context]\n" + lines.join("\n") : "";
}

// ---------------------------------------------------------------------------
// Singleton Anthropic client
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) throw new Error("CLAUDE_API_KEY is not set");
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, context } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages array is required", { status: 400 });
  }

  // Inject student context into the first user turn
  const contextNote = buildContextNote(context);
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m, i) => ({
    role:    m.role as "user" | "assistant",
    content: i === 0 && m.role === "user" ? m.content + contextNote : m.content,
  }));

  let client: Anthropic;
  try {
    client = getClient();
  } catch (err) {
    console.error("[/api/chat] client init error:", err);
    return new Response("CLAUDE_API_KEY not configured", { status: 500 });
  }

  // ── Stream via Anthropic SDK ─────────────────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sdkStream = await client.messages.stream({
          model:      "claude-sonnet-4-6",
          max_tokens: 1024,
          system:     SYSTEM_PROMPT,
          messages:   anthropicMessages,
        });

        for await (const event of sdkStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = JSON.stringify({ text: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
          }
        }

        // Signal done
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      } catch (err) {
        console.error("[/api/chat] streaming error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
