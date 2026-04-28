// scripts/scrape-courses.ts
//
// Scrapes the W&M FOSE registration API and upserts Course + Section rows.
//
// Usage:
//   npx tsx scripts/scrape-courses.ts [term]
//
// term defaults to 202620 (Spring 2026).
// Available term codes follow the pattern YYYYSS: 10=Fall, 20=Spring, 30=Summer.
//   202510 = Fall 2025    202520 = Spring 2025
//   202610 = Fall 2026    202620 = Spring 2026

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient, Season } from "@prisma/client";
import { parse as parseHtml } from "node-html-parser";

const prisma = new PrismaClient();
const API = "https://registration.wm.edu/api/?page=fose&route=";
const DELAY_MS = 150; // ms between detail requests — polite crawl rate

// ---------------------------------------------------------------------------
// Types from the FOSE API
// ---------------------------------------------------------------------------

interface FoseSection {
  code: string;        // "CSCI 141"
  title: string;
  crn: string;
  no: string;          // section number "01"
  stat: string;        // "A" | "F" | "C"
  meets: string;       // "MWF 10-10:50a" | "TBA"
  meetingTimes: string; // JSON string
  instr: string;
  start_date: string;
  end_date: string;
  cart_opts: string;   // JSON — contains credit_hrs
  srcdb: string;
}

interface FoseMeetingTime {
  meet_day: string;   // "0"=M, "1"=T, "2"=W, "3"=R(Thu), "4"=F
  start_time: string; // "1000"
  end_time: string;   // "1050"
}

interface FoseDetail {
  description: string;
  hours_html: string;        // "4 Credit Hours"
  attributes_all: string;    // HTML <ul> of attribute labels
  all_sections: string;      // HTML grid with room column
}

// ---------------------------------------------------------------------------
// Term helpers
// ---------------------------------------------------------------------------

function termToSeasonYear(srcdb: string): { season: Season; year: number } {
  const ss = srcdb.slice(4); // "10" | "20" | "30"
  const year = parseInt(srcdb.slice(0, 4), 10);
  if (ss === "10") return { season: Season.FALL,   year };
  if (ss === "30") return { season: Season.SUMMER, year };
  return                     { season: Season.SPRING, year };
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Extract day letters (e.g. "MWF", "TR") from FOSE meetingTimes JSON. */
function parseDays(meetingTimesJson: string): string | null {
  try {
    const times: FoseMeetingTime[] = JSON.parse(meetingTimesJson);
    if (!times.length) return null;
    const MAP: Record<string, string> = {
      "0": "M", "1": "T", "2": "W", "3": "R", "4": "F",
    };
    const seen = new Set(times.map((t) => MAP[t.meet_day] ?? ""));
    const unique = Array.from(seen).filter(Boolean);
    // sort by day order M-T-W-R-F
    const ORDER = ["M","T","W","R","F"];
    unique.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return unique.join("") || null;
  } catch {
    return null;
  }
}

/** Convert "1000" → "10:00am", "930" or "0930" → "9:30am", "1350" → "1:50pm". */
function formatTime(hhmm: string): string {
  const padded = hhmm.padStart(4, "0");
  const h = parseInt(padded.slice(0, 2), 10);
  const m = padded.slice(2);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m}${suffix}`;
}

/** Parse start/end times from meetingTimes JSON (uses first entry). */
function parseTimes(meetingTimesJson: string): { startTime: string | null; endTime: string | null } {
  try {
    const times: FoseMeetingTime[] = JSON.parse(meetingTimesJson);
    if (!times.length) return { startTime: null, endTime: null };
    return {
      startTime: formatTime(times[0].start_time),
      endTime:   formatTime(times[0].end_time),
    };
  } catch {
    return { startTime: null, endTime: null };
  }
}

/** Parse credits from cart_opts JSON. */
function parseCredits(cartOptsJson: string): number {
  try {
    const opts = JSON.parse(cartOptsJson);
    const creditOptions: { value: string; default?: boolean }[] =
      opts?.credit_hrs?.options ?? [];
    const def = creditOptions.find((o) => o.default) ?? creditOptions[0];
    return def ? parseInt(def.value, 10) || 3 : 3;
  } catch {
    return 3;
  }
}

/** Extract COLL attribute ("COLL 100", "COLL 200", etc.) from attributes HTML.
 *  The API returns e.g. "College 150 (C150)" or "College 200 (C200)". */
function parseCollAttribute(attributesHtml: string): string | null {
  // Match the parenthesised code: (C100), (C150), (C200), (C300), (C350), (C500)
  const match = attributesHtml.match(/\(C(\d{3})\)/);
  if (match) return `COLL ${match[1]}`;
  // Fallback: plain "College NNN" text
  const fallback = attributesHtml.match(/College\s+(\d{3})/i);
  return fallback ? `COLL ${fallback[1]}` : null;
}

/** Extract NQR/ALV/CSI boolean flags from attributes HTML. */
function parseGenEdFlags(attributesHtml: string): { alv: boolean; nqr: boolean; csi: boolean } {
  const lower = attributesHtml.toLowerCase();
  return {
    nqr: lower.includes("nqr") || lower.includes("nat world quant"),
    alv: lower.includes("alv") || lower.includes("arts, lit") || lower.includes("arts &amp; lit"),
    csi: lower.includes("csi") || lower.includes("culture, society"),
  };
}

/** Extract room per CRN from the all_sections HTML grid. */
function parseRooms(allSectionsHtml: string): Map<string, string> {
  const rooms = new Map<string, string>();
  try {
    const root = parseHtml(allSectionsHtml);
    const rows = root.querySelectorAll("a.course-section");
    for (const row of rows) {
      const crnEl = row.querySelector(".course-section-crn");
      const roomEl = row.querySelector(".course-section-meeting-html--room");
      if (!crnEl || !roomEl) continue;
      const crn = crnEl.text.replace(/CRN:\s*/i, "").trim();
      const room = roomEl.text.replace(/Room:\s*/i, "").trim();
      if (crn && room) rooms.set(crn, room);
    }
  } catch {
    // ignore parse errors — rooms will be null
  }
  return rooms;
}

/** Strip HTML tags from a string. */
function stripHtml(html: string): string {
  return parseHtml(html).text.trim();
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function fetchAllSections(srcdb: string): Promise<FoseSection[]> {
  const res = await fetch(`${API}search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      other: { srcdb, is_ind_study: "N", is_canc: "N" },
      criteria: [],
    }),
  });
  const data = await res.json() as { results: FoseSection[]; count: number };
  console.log(`  Fetched ${data.count} sections from term ${srcdb}`);
  return data.results ?? [];
}

async function fetchCourseDetail(code: string, srcdb: string): Promise<FoseDetail | null> {
  try {
    const res = await fetch(`${API}details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: `code:${code}`, srcdb }),
    });
    if (!res.ok) return null;
    return await res.json() as FoseDetail;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const srcdb = process.argv[2] ?? "202620";
  const { season, year } = termToSeasonYear(srcdb);
  const term = srcdb;

  console.log(`\nScraping W&M courses — term ${srcdb} (${season} ${year})\n`);

  // Step 1: fetch all sections in a single request
  console.log("Step 1: fetching all sections...");
  const sections = await fetchAllSections(srcdb);

  // Step 2: group sections by course code → unique course list
  const byCourse = new Map<string, FoseSection[]>();
  for (const s of sections) {
    if (!byCourse.has(s.code)) byCourse.set(s.code, []);
    byCourse.get(s.code)!.push(s);
  }
  const uniqueCodes = Array.from(byCourse.keys());
  console.log(`\nStep 2: found ${uniqueCodes.length} unique courses\n`);

  // Step 3: for each course fetch detail (description, attributes, rooms)
  let processed = 0;
  let inserted = 0;
  let errors = 0;

  for (const code of uniqueCodes) {
    const courseSections = byCourse.get(code)!;
    const first = courseSections[0];

    // Parse department ("CSCI 141" → "CSCI", "141")
    const parts = code.trim().split(/\s+/);
    const department = parts[0];
    const courseNumber = parts.slice(1).join("");
    const courseCode = `${department}${courseNumber}`; // "CSCI141"

    // Credits from first section's cart_opts
    const credits = parseCredits(first.cart_opts);

    // Fetch detail for description, attributes, room per section
    await sleep(DELAY_MS);
    const detail = await fetchCourseDetail(code, srcdb);

    let description: string | null = null;
    let collAttribute: string | null = null;
    let alv = false;
    let nqr = false;
    let csi = false;
    let rooms = new Map<string, string>();

    if (detail) {
      description = detail.description ? stripHtml(detail.description) : null;
      collAttribute = parseCollAttribute(detail.attributes_all ?? "");
      const flags = parseGenEdFlags(detail.attributes_all ?? "");
      alv = flags.alv;
      nqr = flags.nqr;
      csi = flags.csi;
      rooms = parseRooms(detail.all_sections ?? "");
    }

    try {
      // Upsert course
      const course = await prisma.course.upsert({
        where: { code: courseCode },
        update: {
          title:         first.title,
          credits,
          description,
          department,
          collAttribute,
          alv,
          nqr,
          csi,
        },
        create: {
          code:          courseCode,
          title:         first.title,
          credits,
          description,
          department,
          collAttribute,
          alv,
          nqr,
          csi,
        },
      });

      // Upsert each section
      for (const s of courseSections) {
        const days      = parseDays(s.meetingTimes);
        const { startTime, endTime } = parseTimes(s.meetingTimes);
        const location  = rooms.get(s.crn) ?? null;
        const instructor = s.instr || null;
        const status    = s.stat ?? "A";

        await prisma.section.upsert({
          where: { crn: s.crn },
          update: {
            section:    s.no,
            term,
            year,
            season,
            days,
            startTime,
            endTime,
            location,
            instructor,
            status,
            courseId:   course.id,
          },
          create: {
            crn:        s.crn,
            section:    s.no,
            term,
            year,
            season,
            days,
            startTime,
            endTime,
            location,
            instructor,
            status,
            courseId:   course.id,
          },
        });
      }

      inserted++;
    } catch (err) {
      errors++;
      console.error(`  ERROR on ${courseCode}:`, (err as Error).message);
    }

    processed++;
    if (processed % 50 === 0) {
      console.log(`  Progress: ${processed}/${uniqueCodes.length} courses (${errors} errors)`);
    }
  }

  const courseCount = await prisma.course.count();
  const sectionCount = await prisma.section.count();

  console.log(`\nDone!`);
  console.log(`  Courses upserted: ${inserted} (${errors} errors)`);
  console.log(`  Total in DB — courses: ${courseCount}, sections: ${sectionCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});
