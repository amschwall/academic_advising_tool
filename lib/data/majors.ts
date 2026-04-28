// file: lib/data/majors.ts
// Static catalogue of W&M majors, minors, and concentrations.
// Requirements are expressed as either a specific required course or a
// credit-hour threshold from a particular department / level.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CourseRequirement {
  type: "course";
  code: string;    // exact Banner course code, e.g. "CSCI141"
  title: string;
  credits: number;
  /** Known prerequisite course codes within this program's requirement chain. */
  prerequisiteCodes?: string[];
}

export interface CreditRequirement {
  type: "credits";
  description: string;   // human-readable label, e.g. "Upper-division CSCI electives"
  credits: number;       // minimum credits required
  departments?: string[]; // course.department must be in this list (omit = any dept)
  minLevel?: number;     // course level (hundreds digit × 100) must be ≥ this value
}

/**
 * Requires `count` courses that carry the given COLL attribute (e.g. "ALV", "CSI", "NQR").
 * Courses are drawn from the available catalog filtered by collAttribute.
 */
export interface AttributeRequirement {
  type: "attribute";
  description: string;
  attribute: string;   // matches course.collAttribute, e.g. "ALV"
  credits: number;     // credits needed (one course worth)
  count: number;       // how many distinct courses are required
}

export type MajorRequirementItem = CourseRequirement | CreditRequirement | AttributeRequirement;

export interface ProgramDefinition {
  name: string;
  type: "major" | "minor" | "concentration" | "gen-ed";
  requirements: MajorRequirementItem[];
  /**
   * For concentrations: which major names this concentration is available under.
   * Undefined means the concentration is not major-restricted.
   */
  applicableMajors?: string[];
}

// ---------------------------------------------------------------------------
// Majors
// ---------------------------------------------------------------------------

export const MAJORS: ProgramDefinition[] = [
  {
    name: "Computer Science",
    type: "major",
    requirements: [
      { type: "course",   code: "CSCI141", title: "Introduction to Programming", credits: 4 },
      { type: "course",   code: "CSCI241", title: "Data Structures",              credits: 4, prerequisiteCodes: ["CSCI141"] },
      { type: "course",   code: "CSCI303", title: "Algorithms",                   credits: 4, prerequisiteCodes: ["CSCI241"] },
      { type: "credits",  description: "Upper-division CSCI electives", credits: 12,
        departments: ["CSCI"], minLevel: 300 },
    ],
  },
  {
    name: "Economics",
    type: "major",
    requirements: [
      { type: "course",  code: "ECON101", title: "Principles of Microeconomics", credits: 3 },
      { type: "course",  code: "ECON102", title: "Principles of Macroeconomics", credits: 3 },
      { type: "credits", description: "Upper-division ECON courses", credits: 15,
        departments: ["ECON"], minLevel: 300 },
    ],
  },
  {
    name: "History",
    type: "major",
    requirements: [
      { type: "credits", description: "HIST courses", credits: 30, departments: ["HIST"] },
      { type: "credits", description: "Upper-division HIST courses", credits: 18,
        departments: ["HIST"], minLevel: 300 },
    ],
  },
  {
    name: "Government",
    type: "major",
    requirements: [
      { type: "credits", description: "GOVT courses", credits: 30, departments: ["GOVT"] },
      { type: "credits", description: "Upper-division GOVT courses", credits: 15,
        departments: ["GOVT"], minLevel: 300 },
    ],
  },
  {
    name: "Biology",
    type: "major",
    requirements: [
      { type: "course",  code: "BIOL204", title: "Cell Biology", credits: 4 },
      { type: "course",  code: "BIOL205", title: "Genetics",     credits: 4, prerequisiteCodes: ["BIOL204"] },
      { type: "credits", description: "Upper-division BIOL courses", credits: 12,
        departments: ["BIOL"], minLevel: 300 },
    ],
  },
  {
    name: "Psychology",
    type: "major",
    requirements: [
      { type: "course",  code: "PSYC201", title: "Research Methods", credits: 4 },
      { type: "credits", description: "PSYC electives", credits: 21, departments: ["PSYC"] },
    ],
  },
  {
    name: "English",
    type: "major",
    requirements: [
      { type: "credits", description: "ENGL courses", credits: 30, departments: ["ENGL"] },
    ],
  },
  {
    name: "Mathematics",
    type: "major",
    requirements: [
      { type: "course",  code: "MATH111", title: "Calculus I",   credits: 4 },
      { type: "course",  code: "MATH112", title: "Calculus II",  credits: 4, prerequisiteCodes: ["MATH111"] },
      { type: "course",  code: "MATH211", title: "Calculus III", credits: 4, prerequisiteCodes: ["MATH112"] },
      { type: "credits", description: "Upper-division MATH courses", credits: 12,
        departments: ["MATH"], minLevel: 300 },
    ],
  },
  {
    name: "Physics",
    type: "major",
    requirements: [
      { type: "course",  code: "PHYS101", title: "General Physics I",  credits: 4 },
      { type: "course",  code: "PHYS102", title: "General Physics II", credits: 4, prerequisiteCodes: ["PHYS101"] },
      { type: "credits", description: "Upper-division PHYS courses", credits: 15,
        departments: ["PHYS"], minLevel: 300 },
    ],
  },
  {
    name: "Chemistry",
    type: "major",
    requirements: [
      { type: "course",  code: "CHEM103", title: "General Chemistry I",  credits: 4 },
      { type: "course",  code: "CHEM104", title: "General Chemistry II", credits: 4, prerequisiteCodes: ["CHEM103"] },
      { type: "credits", description: "Upper-division CHEM courses", credits: 12,
        departments: ["CHEM"], minLevel: 300 },
    ],
  },
  {
    name: "Sociology",
    type: "major",
    requirements: [
      { type: "credits", description: "SOCL courses", credits: 30, departments: ["SOCL"] },
    ],
  },
  {
    name: "Neuroscience",
    type: "major",
    requirements: [
      { type: "course",  code: "BIOL204", title: "Cell Biology", credits: 4 },
      { type: "credits", description: "Neuroscience core courses", credits: 24,
        departments: ["BIOL", "PSYC", "CHEM"] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Minors
// ---------------------------------------------------------------------------

export const MINORS: ProgramDefinition[] = [
  {
    name: "History",
    type: "minor",
    requirements: [
      { type: "credits", description: "HIST courses", credits: 18, departments: ["HIST"] },
    ],
  },
  {
    name: "Mathematics",
    type: "minor",
    requirements: [
      { type: "credits", description: "MATH courses", credits: 18, departments: ["MATH"] },
    ],
  },
  {
    name: "Computer Science",
    type: "minor",
    requirements: [
      { type: "course",  code: "CSCI141", title: "Introduction to Programming", credits: 4 },
      { type: "credits", description: "CSCI electives", credits: 12, departments: ["CSCI"] },
    ],
  },
  {
    name: "Economics",
    type: "minor",
    requirements: [
      { type: "credits", description: "ECON courses", credits: 18, departments: ["ECON"] },
    ],
  },
  {
    name: "Philosophy",
    type: "minor",
    requirements: [
      { type: "credits", description: "PHIL courses", credits: 18, departments: ["PHIL"] },
    ],
  },
  {
    name: "Psychology",
    type: "minor",
    requirements: [
      { type: "credits", description: "PSYC courses", credits: 18, departments: ["PSYC"] },
    ],
  },
  {
    name: "Sociology",
    type: "minor",
    requirements: [
      { type: "credits", description: "SOCL courses", credits: 18, departments: ["SOCL"] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Concentrations
// ---------------------------------------------------------------------------

export const CONCENTRATIONS: ProgramDefinition[] = [
  {
    name: "Data Science",
    type: "concentration",
    applicableMajors: ["Computer Science", "Mathematics", "Physics", "Economics"],
    requirements: [
      { type: "course",  code: "DATA311", title: "Machine Learning", credits: 3 },
      { type: "credits", description: "DATA electives", credits: 6, departments: ["DATA"] },
    ],
  },
  {
    name: "International Relations",
    type: "concentration",
    applicableMajors: ["Government", "History", "Economics", "Sociology"],
    requirements: [
      { type: "credits", description: "GOVT international courses", credits: 12,
        departments: ["GOVT"] },
    ],
  },
  {
    name: "Computational Biology",
    type: "concentration",
    applicableMajors: ["Biology", "Computer Science", "Neuroscience", "Chemistry"],
    requirements: [
      { type: "credits", description: "Computational Biology courses", credits: 15,
        departments: ["BIOL", "CSCI"] },
    ],
  },
];

// ---------------------------------------------------------------------------
// W&M COLL Curriculum (gen-ed requirements)
// ---------------------------------------------------------------------------

/**
 * Simplified representation of the William & Mary COLL Curriculum.
 * AttributeRequirement entries select courses by their collAttribute field.
 * CreditRequirement entries with no department filter draw from the whole catalog.
 */
export const COLL_CURRICULUM: ProgramDefinition = {
  name: "W&M COLL Curriculum",
  type: "gen-ed",
  requirements: [
    // COLL 100 / 150 — first-year writing & seminar (any course, no dept filter)
    { type: "credits", description: "COLL 100/150: First-Year Writing & Seminar", credits: 6 },
    // COLL 200 domain areas — "attribute" values map to the boolean DB columns
    // (alv / csi / nqr) via the flag-first matching logic in buildRequirementsFromPrograms.
    { type: "attribute", description: "COLL 200: Arts, Letters & Values",                  attribute: "alv", credits: 3, count: 1 },
    { type: "attribute", description: "COLL 200: Creative & Symbolic Inquiry",             attribute: "csi", credits: 3, count: 1 },
    { type: "attribute", description: "COLL 200: Natural World & Quantitative Reasoning",  attribute: "nqr", credits: 3, count: 1 },
    // COLL 300 — upper-division writing-intensive (any 300+ course)
    { type: "credits", description: "COLL 300: Upper-Division Writing Intensive", credits: 3, minLevel: 300 },
    // COLL 400 — senior capstone (any 400+ course)
    { type: "credits", description: "COLL 400: Senior Capstone", credits: 3, minLevel: 400 },
  ],
};
