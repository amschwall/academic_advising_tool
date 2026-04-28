// file: app/chat/page.tsx
"use client";

import React from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { ChatPanel } from "@/components/ChatPanel";

export default function ChatPage() {
  const sensors = useSensors(useSensor(PointerSensor));

  return (
    <DndContext sensors={sensors}>
      <div className="flex h-screen flex-col bg-gray-50">
        {/* Page heading */}
        <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900">Ask Your Advisor</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            Powered by Claude — your AI academic advisor at William &amp; Mary
          </p>
        </header>

        {/* Chat panel fills remaining height */}
        <div className="flex-1 overflow-hidden">
          <ChatPanel />
        </div>
      </div>
    </DndContext>
  );
}
