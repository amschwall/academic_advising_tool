// scripts/scrape-courses.ts
//
// Scrapes the W&M FOSE registration API and upserts Course + Section rows,
// including prerequisites and major-enrollment restrictions.
//
// Usage:
//   npx tsx scripts/scrape-courses.ts [term]
//
// term defaults to 202610 (Fall 2025).
// Available term codes: YYYYSS where SS = 10=Fall, 20=Spring, 30=Summer.
//   202510 = Fall 2024    202520 = Spring 2025
//   202610 = Fall 2025    202620 = Spring 2026

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
  hours_html: string;               // "4 Credit Hours"
  attributes_all: string;           // text of attribute labels
  all_sections: string;             // HTML grid with room column
  registration_restrictions: string; // HTML with prereq/maj/lvl paragraphs
  course_coreqs: string;            // plain text coreqs e.g. "CSCI 141L"
}

// ---------------------------------------------------------------------------
// Major name → department code mapping
// ---------------------------------------------------------------------------
// Covers W&M major names that appear in restriction text.

const MAJOR_NAME_TO_DEPT: Record<string, string> = {
  "accounting":                    "BUAD",
  "africana studies":              "AFST",
  "american studies":              "AMST",
  "anthropology":                  "ANTH",
  "applied science":               "APSC",
  "arabic":                        "ARAB",
  "art and art history":           "ARTH",
  "art history":                   "ARTH",
  "arts and sciences":             "COLL",
  "asian and middle eastern studies": "AMES",
  "biology":                       "BIOL",
  "biophysics":                    "BPHY",
  "business":                      "BUAD",
  "chemistry":                     "CHEM",
  "chinese":                       "CHIN",
  "classical studies":             "CLST",
  "cognitive science":             "COGS",
  "computational and applied mathematics": "CAMA",
  "computational biology":         "CBIO",
  "computer science":              "CSCI",
  "creative writing":              "ENGL",
  "data science":                  "DATA",
  "economics":                     "ECON",
  "education":                     "EDUC",
  "english":                       "ENGL",
  "environmental science":         "ENSP",
  "environmental policy":          "ENSP",
  "environmental studies":         "ENSP",
  "film and media studies":        "FMST",
  "finance":                       "BUAD",
  "french":                        "FREN",
  "gender, sexuality and women's studies": "GSWS",
  "geology":                       "GEOL",
  "german":                        "GERM",
  "government":                    "GOVT",
  "greek":                         "GREK",
  "history":                       "HIST",
  "international relations":       "INTR",
  "italian":                       "ITAL",
  "japanese":                      "JAPN",
  "kinesiology":                   "KINE",
  "latin":                         "LATN",
  "latin american studies":        "LAST",
  "law":                           "LAW",
  "linguistics":                   "LING",
  "management":                    "BUAD",
  "marketing":                     "BUAD",
  "mathematics":                   "MATH",
  "medieval & renaissance studies":"MDVL",
  "middle eastern studies":        "MESA",
  "music":                         "MUSC",
  "neuroscience":                  "NEUR",
  "philosophy":                    "PHIL",
  "physics":                       "PHYS",
  "political science":             "GOVT",
  "portuguese":                    "PORT",
  "psychology":                    "PSYC",
  "public health":                 "PBHL",
  "public policy":                 "PPOL",
  "religion":                      "RELG",
  "russian":                       "RUSS",
  "sociology":                     "SOCL",
  "spanish":                       "HISP",
  "studio art":                    "ARTS",
  "theatre":                       "THEA",
  "theatre and speech":            "THEA",
  "women's studies":               "GSWS",
};

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
    const ORDER = ["M","T","W","R","F"];
    unique.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return unique.join("") || null;
  } catch {
    return null;
  }
}

/** Convert "1000" → "10:00 AM", "930" → "9:30 AM", "1350" → "1:50 PM". */
function formatTime(hhmm: string): string {
  const padded = hhmm.padStart(4, "0");
  const h = parseInt(padded.slice(0, 2), 10);
  const m = padded.slice(2);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${suffix}`;
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

/** Extract COLL attribute from attributes text. */
function parseCollAttribute(attributesText: string): string | null {
  const match = attributesText.match(/\(C(\d{3})\)/);
  if (match) return `COLL ${match[1]}`;
  const fallback = attributesText.match(/College\s+(\d{3})/i);
  return fallback ? `COLL ${fallback[1]}` : null;
}

/** Extract NQR/ALV/CSI boolean flags from attributes text. */
function parseGenEdFlags(attributesText: string): { alv: boolean; nqr: boolean; csi: boolean } {
  const lower = attributesText.toLowerCase();
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
    // ignore parse errors
  }
  return rooms;
}

/** Strip HTML tags. */
function stripHtml(html: string): string {
  return parseHtml(html).text.trim();
}

/**
 * Extract prerequisite course codes (e.g. ["CSCI241", "MATH214"]) from the
 * registration_restrictions HTML.  Looks for the <p class="prereq"> paragraph
 * and pulls out all course codes, including abbreviated forms where the subject
 * is omitted (e.g. "ART 313 and 314" → ["ART313", "ART314"]).
 */
function parsePrerequisiteCodes(restrictionsHtml: string): string[] {
  if (!restrictionsHtml) return [];
  const prereqMatch = restrictionsHtml.match(/class="prereq">([\s\S]*?)<\/p>/i);
  if (!prereqMatch) return [];
  const text = stripHtml(prereqMatch[1]);

  // Walk through tokens: "SUBJ NNN" sets the current subject; bare "NNN"
  // inherits it.  This handles "ART 313 and 314" → ART313, ART314.
  const codes: string[] = [];
  let lastSubj: string | null = null;
  const TOKEN = /\b([A-Z]{2,4})\s+(\d{3,4})\b|\b(\d{3,4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m[1]) {
      // Full "SUBJ NNN" match
      lastSubj = m[1];
      codes.push(`${lastSubj}${m[2]}`);
    } else if (m[3] && lastSubj) {
      // Bare number — inherit the last seen subject
      codes.push(`${lastSubj}${m[3]}`);
    }
  }
  // Deduplicate while preserving order
  return [...new Map(codes.map((c) => [c, c])).values()];
}

/**
 * Extract the department code for a major-enrollment restriction.
 * Returns null when there is no <p class="maj"> or no matching department.
 *
 * Example input: "Enrollment is limited to students with a major in Computer Science."
 * Returns: "CSCI"
 */
function parseMajorRestriction(restrictionsHtml: string): string | null {
  if (!restrictionsHtml) return null;
  const majMatch = restrictionsHtml.match(/class="maj">([\s\S]*?)<\/p>/i);
  if (!majMatch) return null;
  const text = stripHtml(majMatch[1]).toLowerCase();
  // Look for "major in X" or "major or minor in X"
  const nameMatch = text.match(/major(?:\s+or\s+minor)?\s+in\s+([a-z &,']+?)(?:\.|$)/);
  if (!nameMatch) return null;
  const majorName = nameMatch[1].trim().replace(/\s+/g, " ");
  return MAJOR_NAME_TO_DEPT[majorName] ?? null;
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
    const data = await res.json();
    // API returns an array for some multi-section courses
    return Array.isArray(data) ? data[0] : data as FoseDetail;
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
  const srcdb = process.argv[2] ?? "202610";
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

  // Step 3: upsert courses + sections, collect prerequisite data for pass 2
  let processed = 0;
  let upserted = 0;
  let errors = 0;

  // prereqMap[courseCode] = list of prerequisite course codes (e.g. ["CSCI241","MATH214"])
  const prereqMap = new Map<string, string[]>();

  for (const code of uniqueCodes) {
    const courseSections = byCourse.get(code)!;
    const first = courseSections[0];

    const parts = code.trim().split(/\s+/);
    const department = parts[0];
    const courseNumber = parts.slice(1).join("");
    const courseCode = `${department}${courseNumber}`; // e.g. "CSCI141"

    const credits = parseCredits(first.cart_opts);

    await sleep(DELAY_MS);
    const detail = await fetchCourseDetail(code, srcdb);

    let description: string | null = null;
    let collAttribute: string | null = null;
    let alv = false, nqr = false, csi = false;
    let majorRestriction: string | null = null;
    let rooms = new Map<string, string>();

    if (detail) {
      description     = detail.description ? stripHtml(detail.description) : null;
      collAttribute   = parseCollAttribute(detail.attributes_all ?? "");
      const flags     = parseGenEdFlags(detail.attributes_all ?? "");
      alv = flags.alv; nqr = flags.nqr; csi = flags.csi;
      rooms           = parseRooms(detail.all_sections ?? "");
      majorRestriction = parseMajorRestriction(detail.registration_restrictions ?? "");

      const prereqCodes = parsePrerequisiteCodes(detail.registration_restrictions ?? "");
      if (prereqCodes.length > 0) prereqMap.set(courseCode, prereqCodes);
    }

    try {
      const course = await prisma.course.upsert({
        where: { code: courseCode },
        update: {
          title: first.title,
          credits,
          description,
          department,
          collAttribute,
          alv, nqr, csi,
          majorRestriction,
        },
        create: {
          code: courseCode,
          title: first.title,
          credits,
          description,
          department,
          collAttribute,
          alv, nqr, csi,
          majorRestriction,
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
          update: { section: s.no, term, year, season, days, startTime, endTime, location, instructor, status, courseId: course.id },
          create: { crn: s.crn, section: s.no, term, year, season, days, startTime, endTime, location, instructor, status, courseId: course.id },
        });
      }

      upserted++;
    } catch (err) {
      errors++;
      console.error(`  ERROR on ${courseCode}:`, (err as Error).message);
    }

    processed++;
    if (processed % 50 === 0) {
      console.log(`  Progress: ${processed}/${uniqueCodes.length} (${errors} errors)`);
    }
  }

  console.log(`\nStep 3 complete: ${upserted} courses upserted (${errors} errors)\n`);

  // Step 4: resolve and write Prerequisite links
  console.log("Step 4: writing prerequisite links...");
  let prereqLinked = 0;
  let prereqSkipped = 0;

  for (const [courseCode, prereqCodes] of prereqMap) {
    const course = await prisma.course.findUnique({ where: { code: courseCode } });
    if (!course) { prereqSkipped++; continue; }

    for (const prereqCode of prereqCodes) {
      const prereq = await prisma.course.findUnique({ where: { code: prereqCode } });
      if (!prereq) { prereqSkipped++; continue; }

      try {
        await prisma.prerequisite.upsert({
          where: { courseId_prerequisiteId: { courseId: course.id, prerequisiteId: prereq.id } },
          update: {},
          create: { courseId: course.id, prerequisiteId: prereq.id },
        });
        prereqLinked++;
      } catch {
        prereqSkipped++;
      }
    }
  }

  const courseCount   = await prisma.course.count();
  const sectionCount  = await prisma.section.count();
  const prereqCount   = await prisma.prerequisite.count();
  const restrictedCount = await prisma.course.count({ where: { majorRestriction: { not: null } } });

  console.log(`\n✓ Done!`);
  console.log(`  Courses in DB:           ${courseCount}`);
  console.log(`  Sections in DB:          ${sectionCount}`);
  console.log(`  Prerequisite links:      ${prereqCount} (${prereqLinked} added, ${prereqSkipped} skipped/missing)`);
  console.log(`  Major-restricted courses: ${restrictedCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});
