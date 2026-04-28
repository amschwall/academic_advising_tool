// file: lib/scraper/parser.ts

import type { ParsedSection, TermInfo, AttributeResult } from "./types";

// COLL curriculum attribute codes recognised by the W&M Schedule of Classes.
const COLL_CODES = new Set([
  "C100", "C150", "C30C", "C30D", "C30G", "C350", "C400",
  "FLP", "MAPR", "MATH", "AFLP", "ARTS",
]);

// ---------------------------------------------------------------------------
// parseTime
// ---------------------------------------------------------------------------

/**
 * Converts a Banner 4-digit 24-hour time string ("1000", "1300") to a
 * 12-hour am/pm string ("10:00am", "1:00pm").
 * Returns null for null, empty, or malformed input.
 */
export function parseTime(raw: string | null): string | null {
  if (!raw || raw.length < 4) return null;
  const h = parseInt(raw.slice(0, 2), 10);
  const m = raw.slice(2, 4);
  if (isNaN(h)) return null;
  const isPm = h >= 12;
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m}${isPm ? "pm" : "am"}`;
}

// ---------------------------------------------------------------------------
// parseTerm
// ---------------------------------------------------------------------------

/**
 * Decodes a Banner 6-character term code (e.g. "202610") into a year and
 * season.
 *
 * Banner convention:
 *   YYYYTT where TT: 10 = Fall, 20 = Spring, 30 = Summer
 *
 * For Fall, the calendar year is YYYY - 1:
 *   202610 → Fall 2025  (the Fall that starts the 2025-26 academic year)
 * For Spring/Summer, the calendar year is YYYY itself:
 *   202620 → Spring 2026
 *   202630 → Summer 2026
 *
 * Throws for an unrecognised term suffix.
 */
export function parseTerm(srcdb: string): TermInfo {
  const suffix = srcdb.slice(-2);
  const yearPart = parseInt(srcdb.slice(0, 4), 10);

  if (suffix === "10") return { year: yearPart - 1, season: "FALL" };
  if (suffix === "20") return { year: yearPart, season: "SPRING" };
  if (suffix === "30") return { year: yearPart, season: "SUMMER" };

  throw new Error(
    `Unrecognised Banner term suffix: "${suffix}" (srcdb="${srcdb}")`
  );
}

// ---------------------------------------------------------------------------
// extractAttributes
// ---------------------------------------------------------------------------

/**
 * Parses a comma-separated attribute string from the Banner API (the "atr"
 * field) into structured gen-ed flags and a COLL attribute code.
 *
 * e.g. "C150,ALV"  → { collAttribute: "C150", alv: true, csi: false, nqr: false }
 *      "NQR,CSI"   → { collAttribute: null,    alv: false, csi: true,  nqr: true  }
 */
export function extractAttributes(atr: string | null): AttributeResult {
  const result: AttributeResult = {
    alv: false,
    csi: false,
    nqr: false,
    collAttribute: null,
  };

  if (!atr) return result;

  for (const token of atr.split(",").map((t) => t.trim()).filter(Boolean)) {
    if (token === "ALV") result.alv = true;
    else if (token === "CSI") result.csi = true;
    else if (token === "NQR") result.nqr = true;
    else if (COLL_CODES.has(token)) result.collAttribute = token;
  }

  return result;
}

// ---------------------------------------------------------------------------
// parseFoseResponse
// ---------------------------------------------------------------------------

/**
 * Parses the raw JSON payload from the W&M courselist FOSE API
 * (`api/?page=fose`) into an array of ParsedSection objects.
 *
 * Sections that are missing a CRN or have an unrecognised term code are
 * silently skipped so one bad record cannot abort an entire scrape.
 * Any other unexpected error on an individual record is also skipped.
 */
export function parseFoseResponse(data: unknown): ParsedSection[] {
  if (!data || typeof data !== "object") return [];

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.results)) return [];

  const sections: ParsedSection[] = [];

  for (const raw of obj.results) {
    try {
      const r = raw as Record<string, unknown>;

      const crn = typeof r.crn === "string" ? r.crn : null;
      if (!crn) continue;

      const srcdb = String(r.srcdb ?? "");
      let termInfo: TermInfo;
      try {
        termInfo = parseTerm(srcdb);
      } catch {
        continue;
      }

      const attrs = extractAttributes(
        typeof r.atr === "string" ? r.atr : null
      );

      const instructor =
        typeof r.instructor === "string" && r.instructor.trim()
          ? r.instructor.trim()
          : null;

      const location =
        typeof r.location === "string" && r.location.trim()
          ? r.location.trim()
          : null;

      const days =
        typeof r.days === "string" && r.days.trim()
          ? r.days.trim()
          : null;

      sections.push({
        crn,
        subject: String(r.subj ?? ""),
        courseNumber: String(r.num ?? ""),
        section: String(r.section ?? ""),
        title: String(r.title ?? ""),
        credits: parseInt(String(r.credit_hours ?? "0"), 10),
        scheduleType: String(r.schd ?? ""),
        term: srcdb,
        year: termInfo.year,
        season: termInfo.season,
        days,
        startTime: parseTime(
          typeof r.begin_time === "string" ? r.begin_time : null
        ),
        endTime: parseTime(
          typeof r.end_time === "string" ? r.end_time : null
        ),
        instructor,
        location,
        capacity: typeof r.cap === "number" ? r.cap : null,
        enrolled: typeof r.act === "number" ? r.act : null,
        collAttribute: attrs.collAttribute,
        alv: attrs.alv,
        csi: attrs.csi,
        nqr: attrs.nqr,
        status: (["A", "F", "C"].includes(String(r.stat))
          ? String(r.stat)
          : "A") as "A" | "F" | "C",
      });
    } catch {
      // Skip any record that causes an unexpected error.
    }
  }

  return sections;
}
