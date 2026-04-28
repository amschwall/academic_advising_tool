// file: lib/claude/types.ts

export interface RecommendationResponse {
  text: string;
  isFallback: boolean;
}

export interface ClientOptions {
  /** Milliseconds before the request is abandoned and fallback returned. Default: 10000. */
  timeoutMs?: number;
  /** Maximum API calls allowed per 60-second window. Default: 10. */
  maxRequestsPerMinute?: number;
}

export interface RecommendationClient {
  getRecommendation(query: string): Promise<RecommendationResponse>;
}

/** Minimal shape of an Anthropic API response that the client cares about. */
export interface AnthropicMessage {
  content?: Array<{ type: string; text?: string }>;
}

export type CreateMessageFn = (params: {
  model: string;
  max_tokens: number;
  messages: Array<{ role: string; content: string }>;
}) => Promise<AnthropicMessage>;
