// file: lib/validator/types.ts

export type Season = "FALL" | "SPRING" | "SUMMER" | "WINTER";

export interface Semester {
  year: number;
  season: Season;
}

// ---------------------------------------------------------------------------
// Course & schedule representations (plain objects — no Prisma dependency)
// ---------------------------------------------------------------------------

export interface ValidatorCourse {
  code: string;
  credits: number;
  collAttribute: string | null; // normalised form: "COLL 100", "COLL 400", etc.
  alv: boolean;
  csi: boolean;
  nqr: boolean;
  prerequisiteCodes: string[];
}

export interface ValidatorScheduleItem {
  courseCode: string;
  credits: number;
  year: number;
  season: Season;
  grade: string | null;
  completed: boolean;
  sectionId?: string | null;
}

export interface SectionTimeInfo {
  id: string;
  days: string | null;      // e.g. "MWF", "TR"; null = TBA
  startTime: string | null; // 12-h format e.g. "10:00am"; null = TBA
  endTime: string | null;   // 12-h format e.g. "10:50am"; null = TBA
  year: number;
  season: Season;
}

// ---------------------------------------------------------------------------
// Validation output
// ---------------------------------------------------------------------------

export type ValidationErrorType =
  | "MISSING_COLL"
  | "MISSING_MAJOR_COURSE"
  | "PREREQUISITE_NOT_MET"
  | "CREDIT_LIMIT_EXCEEDED"
  | "BELOW_MINIMUM_CREDITS"
  | "TIME_CONFLICT"
  | "INVALID_COURSE";

export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  courseCode?: string;
  semester?: Semester;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ---------------------------------------------------------------------------
// Composite validator inputs
// ---------------------------------------------------------------------------

export interface CourseAdditionInput {
  /** The course the student wants to add. */
  course: { code: string; credits: number; prerequisiteCodes: string[] };
  targetSemester: Semester;
  /** Total credits already planned for this semester (before adding the course). */
  currentSemesterCredits: number;
  /** Course codes the student has already satisfied as prerequisites. */
  satisfiedPrereqs: Set<string>;
  /** Sections already in the target semester (for time conflict detection). */
  currentSections?: SectionTimeInfo[];
  /** The specific section being added (for time conflict detection). */
  newSection?: SectionTimeInfo;
}

export interface FullScheduleInput {
  student: { id: string; catalogYear: number };
  items: ValidatorScheduleItem[];
  courses: Record<string, ValidatorCourse>;
  /** Ordered list of COLL levels the student must satisfy, e.g. ["COLL 100", "COLL 400"]. */
  collRequirements: string[];
  /** Course codes required for the student's major. */
  majorRequirements: string[];
  /** Optional map of sectionId → SectionTimeInfo for time-conflict detection. */
  sections?: Record<string, SectionTimeInfo>;
}

export interface GraduationRequirement {
  name: string;
  type: "COLL" | "MAJOR" | "MINOR" | "ELECTIVE";
  /** For COLL requirements: the collAttribute level to look for, e.g. "COLL 100". */
  collLevel?: string;
  /** For MAJOR/MINOR/ELECTIVE: every code in this list must be completed. */
  requiredCourseCodes?: string[];
  catalogYear: number;
}

export interface GraduationProgressInput {
  student: { catalogYear: number };
  items: ValidatorScheduleItem[];
  requirements: GraduationRequirement[];
  courses: Record<string, ValidatorCourse>;
}

export interface GraduationProgress {
  completedCredits: number;
  requiredCredits: number; // always 120 for W&M undergrad
  percentComplete: number;
  remainingRequirements: Array<{
    name: string;
    type: "COLL" | "MAJOR" | "MINOR" | "ELECTIVE";
    met: boolean;
  }>;
}
