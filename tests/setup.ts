// file: tests/setup.ts

import * as dotenv from "dotenv";
import path from "path";
import { TextDecoder, TextEncoder } from "util";

// Polyfill for jsdom environments that don't expose web globals.
// Node.js 18+ ships these in `stream/web` and `util` — re-export to global.
const g = global as unknown as Record<string, unknown>;

if (typeof global.TextEncoder === "undefined") {
  g.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  g.TextDecoder = TextDecoder;
}

// ReadableStream / WritableStream / TransformStream (WHATWG Streams API)
if (typeof global.ReadableStream === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const web = require("stream/web");
  g.ReadableStream  = web.ReadableStream;
  g.WritableStream  = web.WritableStream;
  g.TransformStream = web.TransformStream;
}

dotenv.config({ path: path.resolve(__dirname, "../.env.test") });
