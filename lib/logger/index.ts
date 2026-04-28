// file: lib/logger/index.ts

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "metric";
  service: string;
  event: string;
  data?: Record<string, unknown>;
}

type LogWriter = (entry: LogEntry) => void;

// ---------------------------------------------------------------------------
// Writer (injectable for testing; default writes JSON to console.log)
// ---------------------------------------------------------------------------

const defaultWriter: LogWriter = (entry) => console.log(JSON.stringify(entry));

let currentWriter: LogWriter = defaultWriter;

export function setWriter(w: LogWriter): void {
  currentWriter = w;
}

export function resetWriter(): void {
  currentWriter = defaultWriter;
}

// ---------------------------------------------------------------------------
// Core emit
// ---------------------------------------------------------------------------

function emit(
  level: LogEntry["level"],
  service: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    event,
    ...(data !== undefined ? { data } : {}),
  };
  currentWriter(entry);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const logger = {
  info:   (service: string, event: string, data?: Record<string, unknown>) =>
            emit("info",   service, event, data),
  warn:   (service: string, event: string, data?: Record<string, unknown>) =>
            emit("warn",   service, event, data),
  error:  (service: string, event: string, data?: Record<string, unknown>) =>
            emit("error",  service, event, data),
  metric: (service: string, event: string, data?: Record<string, unknown>) =>
            emit("metric", service, event, data),
};
