// file: app/api/chat/route.ts
import { NextRequest } from "next/server";
import OpenAI from "openai";
import { recordUsage } from "@/lib/cost/tracker";

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
    /** Full course catalog available to this student. */
    catalog?:          CourseContext[];
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are an academic advisor at William & Mary (W&M). " +
  "Your role is to help students choose courses and declare majors that align with " +
  "their interests, goals, and degree requirements.\n\n" +
  "IMPORTANT: You will be given the complete list of courses available to this student. " +
  "You MUST only recommend courses that appear in that list. " +
  "Never invent course codes or titles. If a student asks about a subject where no " +
  "matching course exists in the catalog, say so honestly rather than fabricating one.\n\n" +
  "When a student's query is too vague to give specific recommendations, ask one " +
  "clarifying question before proceeding.\n\n" +
  "When the query is specific enough, recommend relevant courses from the catalog and suggest majors. " +
  "Always include the exact course code (e.g. CSCI303, MATH211) and exact title when mentioning a " +
  "specific course so the student can identify it in their planner. Keep responses concise.";

// ---------------------------------------------------------------------------
// Build context note appended to the first user turn
// ---------------------------------------------------------------------------

function buildContextNote(ctx: RequestBody["context"]): string {
  if (!ctx) return "";
  const lines: string[] = [];

  // Catalog comes first so the model knows what it's allowed to recommend.
  if (ctx.catalog?.length) {
    const catalogStr = ctx.catalog
      .map((c) => `${c.code} — ${c.title} (${c.credits} cr)`)
      .join("\n");
    lines.push(`[Available course catalog]\n${catalogStr}`);
  }

  const studentLines: string[] = [];
  if (ctx.completedCourses?.length) {
    studentLines.push(
      "Completed: " + ctx.completedCourses.map((c) => `${c.code} ${c.title}`).join(", "),
    );
  }
  if (ctx.transferCourses?.length) {
    studentLines.push(
      "Transfer/AP: " + ctx.transferCourses.map((c) => `${c.code} ${c.title}`).join(", "),
    );
  }
  if (ctx.plannedCourses?.length) {
    studentLines.push(
      "Currently planned: " + ctx.plannedCourses.map((c) => `${c.code} ${c.title}`).join(", "),
    );
  }
  if (studentLines.length) lines.push("[Student context]\n" + studentLines.join("\n"));

  return lines.length ? "\n\n" + lines.join("\n\n") : "";
}

// ---------------------------------------------------------------------------
// Singleton OpenAI client
// ---------------------------------------------------------------------------

let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
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
  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m, i) => ({
      role:    m.role as "user" | "assistant",
      content: i === 0 && m.role === "user" ? m.content + contextNote : m.content,
    })),
  ];

  let client: OpenAI;
  try {
    client = getClient();
  } catch (err) {
    console.error("[/api/chat] client init error:", err);
    return new Response("OPENAI_API_KEY not configured", { status: 500 });
  }

  // ── Stream via OpenAI SDK ────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sdkStream = await client.chat.completions.create({
          model:      "gpt-4o",
          max_tokens: 1024,
          messages:   openaiMessages,
          stream:     true,
          stream_options: { include_usage: true },
        });

        let inputTokens = 0;
        let outputTokens = 0;

        for await (const chunk of sdkStream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`));
          }
          if (chunk.usage) {
            inputTokens  = chunk.usage.prompt_tokens;
            outputTokens = chunk.usage.completion_tokens;
          }
        }

        recordUsage(inputTokens, outputTokens);

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
