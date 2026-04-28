// file: lib/scraper/types.ts

export interface ParsedSection {
  crn: string;
  subject: string;       // e.g. "CSCI"
  courseNumber: string;  // e.g. "301"
  section: string;       // e.g. "01"
  title: string;
  credits: number;
  scheduleType: string;  // Banner schd code: "LC", "SM", "LB", etc.
  term: string;          // Banner term code, e.g. "202610"
  year: number;          // calendar year the semester begins
  season: "FALL" | "SPRING" | "SUMMER" | "WINTER";
  days: string | null;   // e.g. "MWF", "TR"; null when TBA
  startTime: string | null; // 12-h format e.g. "10:00am"; null when TBA
  endTime: string | null;   // 12-h format e.g. "10:50am"; null when TBA
  instructor: string | null;
  location: string | null;
  capacity: number | null;
  enrolled: number | null;
  collAttribute: string | null; // e.g. "C100", "C400"; null if not a COLL course
  alv: boolean;
  csi: boolean;
  nqr: boolean;
  status: "A" | "F" | "C"; // A=open, F=full, C=cancelled
}

export interface TermInfo {
  year: number;
  season: "FALL" | "SPRING" | "SUMMER" | "WINTER";
}

export interface AttributeResult {
  alv: boolean;
  csi: boolean;
  nqr: boolean;
  collAttribute: string | null;
}

export interface StoreResult {
  coursesUpserted: number;
  sectionsUpserted: number;
}
