// file: tests/scraper.test.ts

import path from "path";
import fs from "fs";
import {
  parseFoseResponse,
  parseTime,
  parseTerm,
  extractAttributes,
} from "@/lib/scraper/parser";
import type { ParsedSection, TermInfo } from "@/lib/scraper/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFixture(name: string): unknown {
  const file = path.join(__dirname, "fixtures", name);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// ---------------------------------------------------------------------------
// parseTime
// ---------------------------------------------------------------------------

describe("parseTime()", () => {
  it("converts Banner 24-h string to 12-h am/pm format", () => {
    expect(parseTime("1000")).toBe("10:00am");
    expect(parseTime("0900")).toBe("9:00am");
    expect(parseTime("1300")).toBe("1:00pm");
    expect(parseTime("1220")).toBe("12:20pm");
    expect(parseTime("0800")).toBe("8:00am");
    expect(parseTime("1700")).toBe("5:00pm");
  });

  it("returns null for null input", () => {
    expect(parseTime(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseTime("")).toBeNull();
  });

  it("returns null for strings shorter than 4 characters", () => {
    expect(parseTime("900")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseTerm
// ---------------------------------------------------------------------------

describe("parseTerm()", () => {
  // Banner term codes: YYYY + TT where TT 10=Fall, 20=Spring, 30=Summer
  // Fall year = parseInt(YYYY) - 1  (202610 → Fall 2025)
  // Spring/Summer year = parseInt(YYYY)

  it("parses Fall term correctly", () => {
    const result: TermInfo = parseTerm("202610");
    expect(result.year).toBe(2025);
    expect(result.season).toBe("FALL");
  });

  it("parses Spring term correctly", () => {
    const result: TermInfo = parseTerm("202620");
    expect(result.year).toBe(2026);
    expect(result.season).toBe("SPRING");
  });

  it("parses Summer term correctly", () => {
    const result: TermInfo = parseTerm("202630");
    expect(result.year).toBe(2026);
    expect(result.season).toBe("SUMMER");
  });

  it("parses a different Fall term", () => {
    const result: TermInfo = parseTerm("202710");
    expect(result.year).toBe(2026);
    expect(result.season).toBe("FALL");
  });

  it("throws for an unrecognised term suffix", () => {
    expect(() => parseTerm("202640")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// extractAttributes
// ---------------------------------------------------------------------------

describe("extractAttributes()", () => {
  it("detects NQR flag from atr string", () => {
    const attrs = extractAttributes("NQR");
    expect(attrs.nqr).toBe(true);
    expect(attrs.alv).toBe(false);
    expect(attrs.csi).toBe(false);
    expect(attrs.collAttribute).toBeNull();
  });

  it("detects ALV flag from atr string", () => {
    const attrs = extractAttributes("ALV");
    expect(attrs.alv).toBe(true);
    expect(attrs.nqr).toBe(false);
    expect(attrs.csi).toBe(false);
  });

  it("detects CSI flag from atr string", () => {
    const attrs = extractAttributes("CSI");
    expect(attrs.csi).toBe(true);
    expect(attrs.alv).toBe(false);
    expect(attrs.nqr).toBe(false);
  });

  it("extracts COLL attribute from comma-separated atr string", () => {
    const attrs = extractAttributes("C150,ALV");
    expect(attrs.collAttribute).toBe("C150");
    expect(attrs.alv).toBe(true);
  });

  it("handles multiple flags and a COLL attribute together", () => {
    const attrs = extractAttributes("NQR,CSI");
    expect(attrs.nqr).toBe(true);
    expect(attrs.csi).toBe(true);
    expect(attrs.collAttribute).toBeNull();
  });

  it("returns all false and null for an empty atr string", () => {
    const attrs = extractAttributes("");
    expect(attrs.alv).toBe(false);
    expect(attrs.csi).toBe(false);
    expect(attrs.nqr).toBe(false);
    expect(attrs.collAttribute).toBeNull();
  });

  it("returns all false and null for null atr", () => {
    const attrs = extractAttributes(null);
    expect(attrs.alv).toBe(false);
    expect(attrs.csi).toBe(false);
    expect(attrs.nqr).toBe(false);
    expect(attrs.collAttribute).toBeNull();
  });

  it("recognises all COLL attribute codes", () => {
    for (const code of ["C100", "C150", "C30C", "C30D", "C30G", "C350", "C400", "FLP", "MAPR", "MATH"]) {
      expect(extractAttributes(code).collAttribute).toBe(code);
    }
  });
});

// ---------------------------------------------------------------------------
// parseFoseResponse — main fixture
// ---------------------------------------------------------------------------

describe("parseFoseResponse() — well-formed fixture", () => {
  let sections: ParsedSection[];

  beforeAll(() => {
    const data = loadFixture("fose-results.json");
    sections = parseFoseResponse(data);
  });

  it("returns the correct number of sections", () => {
    expect(sections).toHaveLength(4);
  });

  // ── CSCI 301 ──────────────────────────────────────────────────────────────

  describe("CSCI 301 (NQR, open)", () => {
    let s: ParsedSection;
    beforeAll(() => { s = sections[0]; });

    it("parses crn", () => expect(s.crn).toBe("10001"));
    it("parses subject", () => expect(s.subject).toBe("CSCI"));
    it("parses courseNumber", () => expect(s.courseNumber).toBe("301"));
    it("parses section", () => expect(s.section).toBe("01"));
    it("parses title", () => expect(s.title).toBe("Algorithms"));
    it("parses credits as integer", () => expect(s.credits).toBe(3));
    it("parses scheduleType", () => expect(s.scheduleType).toBe("LC"));
    it("parses term code", () => expect(s.term).toBe("202610"));
    it("parses year from term", () => expect(s.year).toBe(2025));
    it("parses season from term", () => expect(s.season).toBe("FALL"));
    it("parses days", () => expect(s.days).toBe("MWF"));
    it("parses startTime as 12h format", () => expect(s.startTime).toBe("10:00am"));
    it("parses endTime as 12h format", () => expect(s.endTime).toBe("10:50am"));
    it("parses instructor", () => expect(s.instructor).toBe("Williams, David"));
    it("parses location", () => expect(s.location).toBe("ISC 1280"));
    it("parses capacity", () => expect(s.capacity).toBe(25));
    it("parses enrolled", () => expect(s.enrolled).toBe(18));
    it("sets status open", () => expect(s.status).toBe("A"));
    it("sets nqr true", () => expect(s.nqr).toBe(true));
    it("sets alv false", () => expect(s.alv).toBe(false));
    it("sets csi false", () => expect(s.csi).toBe(false));
    it("sets collAttribute null", () => expect(s.collAttribute).toBeNull());
  });

  // ── HIST 150 ──────────────────────────────────────────────────────────────

  describe("HIST 150 (C150 + ALV, open)", () => {
    let s: ParsedSection;
    beforeAll(() => { s = sections[1]; });

    it("parses subject", () => expect(s.subject).toBe("HIST"));
    it("parses courseNumber", () => expect(s.courseNumber).toBe("150"));
    it("sets alv true", () => expect(s.alv).toBe(true));
    it("sets nqr false", () => expect(s.nqr).toBe(false));
    it("sets collAttribute to C150", () => expect(s.collAttribute).toBe("C150"));
    it("parses TR days", () => expect(s.days).toBe("TR"));
    it("parses 11:00am start", () => expect(s.startTime).toBe("11:00am"));
    it("parses 12:20pm end", () => expect(s.endTime).toBe("12:20pm"));
  });

  // ── BIOL 220 ──────────────────────────────────────────────────────────────

  describe("BIOL 220 (NQR+CSI, full, no instructor)", () => {
    let s: ParsedSection;
    beforeAll(() => { s = sections[2]; });

    it("sets status full", () => expect(s.status).toBe("F"));
    it("sets nqr true", () => expect(s.nqr).toBe(true));
    it("sets csi true", () => expect(s.csi).toBe(true));
    it("returns null for empty instructor string", () => expect(s.instructor).toBeNull());
    it("returns null for null location", () => expect(s.location).toBeNull());
  });

  // ── COLL 100 ──────────────────────────────────────────────────────────────

  describe("COLL 100 (C100, TBA days/times)", () => {
    let s: ParsedSection;
    beforeAll(() => { s = sections[3]; });

    it("parses 0 credits", () => expect(s.credits).toBe(0));
    it("returns null for null days", () => expect(s.days).toBeNull());
    it("returns null for null startTime", () => expect(s.startTime).toBeNull());
    it("returns null for null endTime", () => expect(s.endTime).toBeNull());
    it("sets collAttribute to C100", () => expect(s.collAttribute).toBe("C100"));
  });
});

// ---------------------------------------------------------------------------
// parseFoseResponse — empty fixture
// ---------------------------------------------------------------------------

describe("parseFoseResponse() — empty results", () => {
  it("returns an empty array when count is 0", () => {
    const data = loadFixture("fose-empty.json");
    expect(parseFoseResponse(data)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseFoseResponse — malformed / edge-case inputs
// ---------------------------------------------------------------------------

describe("parseFoseResponse() — malformed inputs", () => {
  it("returns empty array for null input", () => {
    expect(parseFoseResponse(null)).toEqual([]);
  });

  it("returns empty array for non-object input", () => {
    expect(parseFoseResponse("not an object")).toEqual([]);
  });

  it("returns empty array when results field is missing", () => {
    expect(parseFoseResponse({ count: 0 })).toEqual([]);
  });

  it("skips a section whose crn is missing, parses the rest", () => {
    const data = {
      results: [
        { subj: "CSCI", num: "101", title: "Bad record — no CRN" },
        {
          crn: "99999",
          subj: "MATH",
          num: "111",
          section: "01",
          title: "Calculus I",
          credit_hours: "4",
          schd: "LC",
          srcdb: "202610",
          days: "MTWF",
          begin_time: "0800",
          end_time: "0850",
          instructor: "Taylor, Ann",
          location: "Jones 101",
          cap: 30,
          act: 10,
          rem: 20,
          atr: "MAPR",
          stat: "A",
        },
      ],
      count: 2,
    };
    const result = parseFoseResponse(data);
    expect(result).toHaveLength(1);
    expect(result[0].crn).toBe("99999");
  });

  it("skips a section with an unrecognised term code", () => {
    const data = {
      results: [
        {
          crn: "11111",
          subj: "PHIL",
          num: "101",
          section: "01",
          title: "Introduction to Philosophy",
          credit_hours: "3",
          schd: "LC",
          srcdb: "BADTERM",
          days: "TR",
          begin_time: "1300",
          end_time: "1420",
          instructor: "Locke, J.",
          location: "Blair 213",
          cap: 20,
          act: 5,
          rem: 15,
          atr: "",
          stat: "A",
        },
      ],
      count: 1,
    };
    const result = parseFoseResponse(data);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// storeSections integration (Prisma mocked)
// ---------------------------------------------------------------------------

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

const mockPrisma = {
  course: {
    upsert: jest.fn().mockResolvedValue({ id: "course-id-1" }),
  },
  section: {
    upsert: jest.fn().mockResolvedValue({ id: "section-id-1" }),
  },
};

describe("storeSections()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls course.upsert and section.upsert for each parsed section", async () => {
    const { storeSections } = await import("@/lib/scraper/store");
    const sections: ParsedSection[] = [
      {
        crn: "10001",
        subject: "CSCI",
        courseNumber: "301",
        section: "01",
        title: "Algorithms",
        credits: 3,
        scheduleType: "LC",
        term: "202610",
        year: 2025,
        season: "FALL",
        days: "MWF",
        startTime: "10:00am",
        endTime: "10:50am",
        instructor: "Williams, David",
        location: "ISC 1280",
        capacity: 25,
        enrolled: 18,
        collAttribute: null,
        alv: false,
        csi: false,
        nqr: true,
        status: "A",
      },
    ];

    const result = await storeSections(sections, mockPrisma as any);
    expect(mockPrisma.course.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.section.upsert).toHaveBeenCalledTimes(1);
    expect(result.coursesUpserted).toBe(1);
    expect(result.sectionsUpserted).toBe(1);
  });

  it("upserts course with correct fields including gen-ed flags", async () => {
    const { storeSections } = await import("@/lib/scraper/store");
    const sections: ParsedSection[] = [
      {
        crn: "10002",
        subject: "HIST",
        courseNumber: "150",
        section: "01",
        title: "World History to 1500",
        credits: 3,
        scheduleType: "LC",
        term: "202610",
        year: 2025,
        season: "FALL",
        days: "TR",
        startTime: "11:00am",
        endTime: "12:20pm",
        instructor: "Johnson, Mary",
        location: "Morton 202",
        capacity: 30,
        enrolled: 27,
        collAttribute: "C150",
        alv: true,
        csi: false,
        nqr: false,
        status: "A",
      },
    ];

    await storeSections(sections, mockPrisma as any);

    const courseCall = mockPrisma.course.upsert.mock.calls[0][0];
    expect(courseCall.where.code).toBe("HIST150");
    expect(courseCall.create.alv).toBe(true);
    expect(courseCall.create.nqr).toBe(false);
    expect(courseCall.create.csi).toBe(false);
    expect(courseCall.create.collAttribute).toBe("C150");
    expect(courseCall.create.credits).toBe(3);
    expect(courseCall.create.department).toBe("HIST");
  });

  it("upserts section with correct CRN and timing fields", async () => {
    const { storeSections } = await import("@/lib/scraper/store");
    const sections: ParsedSection[] = [
      {
        crn: "10003",
        subject: "BIOL",
        courseNumber: "220",
        section: "02",
        title: "Cell Biology",
        credits: 3,
        scheduleType: "LC",
        term: "202610",
        year: 2025,
        season: "FALL",
        days: "MWF",
        startTime: "9:00am",
        endTime: "9:50am",
        instructor: null,
        location: null,
        capacity: 24,
        enrolled: 24,
        collAttribute: null,
        alv: false,
        csi: true,
        nqr: true,
        status: "F",
      },
    ];

    await storeSections(sections, mockPrisma as any);

    const sectionCall = mockPrisma.section.upsert.mock.calls[0][0];
    expect(sectionCall.where.crn).toBe("10003");
    expect(sectionCall.create.crn).toBe("10003");
    expect(sectionCall.create.section).toBe("02");
    expect(sectionCall.create.year).toBe(2025);
    expect(sectionCall.create.season).toBe("FALL");
    expect(sectionCall.create.status).toBe("F");
    expect(sectionCall.create.instructor).toBeNull();
    expect(sectionCall.create.location).toBeNull();
  });

  it("returns zero counts for empty sections array", async () => {
    const { storeSections } = await import("@/lib/scraper/store");
    const result = await storeSections([], mockPrisma as any);
    expect(result.coursesUpserted).toBe(0);
    expect(result.sectionsUpserted).toBe(0);
    expect(mockPrisma.course.upsert).not.toHaveBeenCalled();
  });
});
