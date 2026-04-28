// file: lib/claude/client.ts

import { buildPrompt } from "./prompt";
import type {
  AnthropicMessage,
  ClientOptions,
  CreateMessageFn,
  RecommendationClient,
  RecommendationResponse,
} from "./types";

export const FALLBACK_MESSAGE =
  "I am unable to process your request at the moment.";

const FALLBACK: RecommendationResponse = { text: FALLBACK_MESSAGE, isFallback: true };

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RPM = 10;
const RATE_WINDOW_MS = 60_000;
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

/** Extracts the text string from an Anthropic API response envelope. */
function extractText(msg: AnthropicMessage): string | null {
  const block = msg.content?.[0];
  if (!block || block.type !== "text" || typeof block.text !== "string") {
    return null;
  }
  return block.text;
}

/**
 * Creates a recommendation client wrapping the provided `createMessage`
 * function (injectable for testing; in production pass `anthropic.messages.create`).
 */
export function createRecommendationClient(
  createMessage: CreateMessageFn,
  options: ClientOptions = {}
): RecommendationClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRpm = options.maxRequestsPerMinute ?? DEFAULT_MAX_RPM;

  // Sliding-window request timestamps for client-side rate limiting
  const requestTimes: number[] = [];

  function isRateLimited(): boolean {
    const now = Date.now();
    // Evict timestamps outside the current window
    while (requestTimes.length > 0 && now - requestTimes[0] >= RATE_WINDOW_MS) {
      requestTimes.shift();
    }
    return requestTimes.length >= maxRpm;
  }

  function recordRequest(): void {
    requestTimes.push(Date.now());
  }

  async function getRecommendation(query: string): Promise<RecommendationResponse> {
    if (isRateLimited()) return FALLBACK;
    recordRequest();

    const apiCall = createMessage({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: buildPrompt(query) }],
    });

    let timerId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>(
      (_, reject) => { timerId = setTimeout(() => reject(new Error("timeout")), timeoutMs); }
    );

    let msg: AnthropicMessage;
    try {
      msg = await Promise.race([apiCall, timeout]);
      clearTimeout(timerId!);
    } catch {
      clearTimeout(timerId!);
      return FALLBACK;
    }

    const text = extractText(msg);
    if (text === null) return FALLBACK;

    return { text, isFallback: false };
  }

  return { getRecommendation };
}
