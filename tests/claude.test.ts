// file: tests/claude.test.ts

import { buildPrompt } from "@/lib/claude/prompt";
import { createRecommendationClient, FALLBACK_MESSAGE } from "@/lib/claude/client";
import type { CreateMessageFn } from "@/lib/claude/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApiResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

function mockApi(text = "Here are some recommendations..."): jest.MockedFunction<CreateMessageFn> {
  return jest.fn().mockResolvedValue(makeApiResponse(text));
}

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

describe("buildPrompt()", () => {
  it("includes the user's query verbatim", () => {
    expect(buildPrompt("I like science")).toContain("I like science");
  });

  it("establishes a W&M academic advisor context", () => {
    const prompt = buildPrompt("anything");
    expect(prompt).toMatch(/William & Mary|William and Mary|W&M/i);
  });

  it("instructs Claude to recommend courses", () => {
    expect(buildPrompt("anything").toLowerCase()).toContain("course");
  });

  it("instructs Claude to suggest majors", () => {
    expect(buildPrompt("anything").toLowerCase()).toContain("major");
  });

  it("instructs Claude to ask clarifying questions for vague input", () => {
    expect(buildPrompt("anything").toLowerCase()).toMatch(/clarif|vague|specific/);
  });

  it("produces a non-empty string", () => {
    expect(buildPrompt("anything").length).toBeGreaterThan(0);
  });

  it("different queries produce different prompts", () => {
    expect(buildPrompt("I like science")).not.toBe(buildPrompt("I like art"));
  });
});

// ---------------------------------------------------------------------------
// getRecommendation — successful responses
// ---------------------------------------------------------------------------

describe("getRecommendation()", () => {
  describe("successful response", () => {
    it("returns Claude's text as-is", async () => {
      const client = createRecommendationClient(mockApi("Take CSCI141 to start!"));
      const result = await client.getRecommendation("I like computers");
      expect(result.text).toBe("Take CSCI141 to start!");
    });

    it("sets isFallback to false", async () => {
      const client = createRecommendationClient(mockApi());
      const result = await client.getRecommendation("I enjoy math");
      expect(result.isFallback).toBe(false);
    });

    it("sends the query inside the user message to the API", async () => {
      const api = mockApi();
      const client = createRecommendationClient(api);

      await client.getRecommendation("I like biology");

      const callArg = api.mock.calls[0][0];
      const userMsg = callArg.messages.find(
        (m: { role: string }) => m.role === "user"
      );
      expect(userMsg?.content).toContain("I like biology");
    });
  });

  // ── JSON parsing (API response envelope) ─────────────────────────────────

  describe("JSON parsing (API response envelope)", () => {
    it("extracts text from content[0].text", async () => {
      const api = jest.fn().mockResolvedValue({
        content: [{ type: "text", text: "Extracted correctly" }],
      });
      const result = await createRecommendationClient(api).getRecommendation("q");
      expect(result.text).toBe("Extracted correctly");
    });

    it("returns fallback when content array is empty", async () => {
      const api = jest.fn().mockResolvedValue({ content: [] });
      const result = await createRecommendationClient(api).getRecommendation("q");
      expect(result.text).toBe(FALLBACK_MESSAGE);
      expect(result.isFallback).toBe(true);
    });

    it("returns fallback when response has no content field", async () => {
      const api = jest.fn().mockResolvedValue({});
      const result = await createRecommendationClient(api).getRecommendation("q");
      expect(result.text).toBe(FALLBACK_MESSAGE);
      expect(result.isFallback).toBe(true);
    });

    it("returns fallback when content[0] is not a text block", async () => {
      const api = jest.fn().mockResolvedValue({
        content: [{ type: "tool_use", id: "abc" }],
      });
      const result = await createRecommendationClient(api).getRecommendation("q");
      expect(result.text).toBe(FALLBACK_MESSAGE);
      expect(result.isFallback).toBe(true);
    });

    it("returns fallback when the API rejects with an error", async () => {
      const api = jest.fn().mockRejectedValue(new Error("Network error"));
      const result = await createRecommendationClient(api).getRecommendation("q");
      expect(result.text).toBe(FALLBACK_MESSAGE);
      expect(result.isFallback).toBe(true);
    });
  });

  // ── Timeout handling ───────────────────────────────────────────────────────

  describe("timeout handling", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("returns fallback text when the API exceeds timeoutMs", async () => {
      const neverResolves: CreateMessageFn = () => new Promise(() => {});
      const client = createRecommendationClient(neverResolves, { timeoutMs: 100 });

      const promise = client.getRecommendation("q");
      await jest.advanceTimersByTimeAsync(101);
      const result = await promise;

      expect(result.text).toBe(FALLBACK_MESSAGE);
    });

    it("sets isFallback to true on timeout", async () => {
      const neverResolves: CreateMessageFn = () => new Promise(() => {});
      const client = createRecommendationClient(neverResolves, { timeoutMs: 100 });

      const promise = client.getRecommendation("q");
      await jest.advanceTimersByTimeAsync(101);
      const result = await promise;

      expect(result.isFallback).toBe(true);
    });

    it("does not trigger fallback when the API responds before timeoutMs", async () => {
      const client = createRecommendationClient(mockApi("Fast!"), { timeoutMs: 5000 });
      const result = await client.getRecommendation("q");
      expect(result.isFallback).toBe(false);
      expect(result.text).toBe("Fast!");
    });
  });

  // ── Rate limiting ──────────────────────────────────────────────────────────

  describe("rate limiting", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("allows requests up to maxRequestsPerMinute", async () => {
      const client = createRecommendationClient(mockApi(), { maxRequestsPerMinute: 3 });

      const results = await Promise.all([
        client.getRecommendation("q1"),
        client.getRecommendation("q2"),
        client.getRecommendation("q3"),
      ]);

      for (const r of results) expect(r.isFallback).toBe(false);
    });

    it("returns fallback when the rate limit is exceeded", async () => {
      const client = createRecommendationClient(mockApi(), { maxRequestsPerMinute: 2 });

      await client.getRecommendation("q1");
      await client.getRecommendation("q2");
      const result = await client.getRecommendation("q3");

      expect(result.isFallback).toBe(true);
      expect(result.text).toBe(FALLBACK_MESSAGE);
    });

    it("does not call the API when rate limited", async () => {
      const api = mockApi();
      const client = createRecommendationClient(api, { maxRequestsPerMinute: 2 });

      await client.getRecommendation("q1");
      await client.getRecommendation("q2");
      await client.getRecommendation("q3");

      expect(api).toHaveBeenCalledTimes(2);
    });

    it("allows new requests after the 60-second window resets", async () => {
      const api = mockApi();
      const client = createRecommendationClient(api, { maxRequestsPerMinute: 2 });

      await client.getRecommendation("q1");
      await client.getRecommendation("q2");

      const blocked = await client.getRecommendation("q3");
      expect(blocked.isFallback).toBe(true);

      jest.advanceTimersByTime(61_000);

      const result = await client.getRecommendation("q4");
      expect(result.isFallback).toBe(false);
    });
  });

  // ── Vague input handling ───────────────────────────────────────────────────

  describe("vague input handling", () => {
    it("passes Claude's clarifying question through as-is", async () => {
      const question = "Could you tell me more about what aspects of science interest you?";
      const client = createRecommendationClient(mockApi(question));

      const result = await client.getRecommendation("I like science");
      expect(result.text).toBe(question);
    });

    it("sets isFallback to false when Claude responds with a clarifying question", async () => {
      const client = createRecommendationClient(
        mockApi("What area of science are you most drawn to?")
      );
      const result = await client.getRecommendation("I like science");
      expect(result.isFallback).toBe(false);
    });

    it("still calls the API for vague queries — vagueness detection is Claude's job", async () => {
      const api = mockApi("Can you be more specific?");
      await createRecommendationClient(api).getRecommendation("I like things");
      expect(api).toHaveBeenCalledTimes(1);
    });

    it("includes the vague query in the prompt sent to Claude", async () => {
      const api = mockApi("What do you mean by science?");
      await createRecommendationClient(api).getRecommendation("I like science");

      const callArg = api.mock.calls[0][0];
      const userMsg = callArg.messages.find(
        (m: { role: string }) => m.role === "user"
      );
      expect(userMsg?.content).toContain("I like science");
    });
  });
});
