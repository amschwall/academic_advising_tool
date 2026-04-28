// file: lib/stores/chatStore.ts
import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;

  addMessage: (msg: ChatMessage) => void;
  /** Replace the content of the last assistant message (used during streaming). */
  updateLastAssistantMessage: (text: string) => void;
  setLoading: (b: boolean) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useChatStore = create<ChatStore>((set) => ({
  messages:  [],
  isLoading: false,
  error:     null,

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  updateLastAssistantMessage: (text) =>
    set((s) => {
      // Find the last assistant message (searching from the end).
      let lastIdx = -1;
      for (let i = s.messages.length - 1; i >= 0; i--) {
        if (s.messages[i].role === "assistant") { lastIdx = i; break; }
      }
      if (lastIdx === -1) return {};
      const messages = s.messages.map((m, i) =>
        i === lastIdx ? { ...m, content: text } : m,
      );
      return { messages };
    }),

  setLoading: (b)   => set({ isLoading: b }),
  setError:   (msg) => set({ error: msg }),
  reset:      ()    => set({ messages: [], isLoading: false, error: null }),
}));
