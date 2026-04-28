// file: lib/generator/types.ts

export type Season = "FALL" | "SPRING" | "SUMMER" | "WINTER";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface GeneratorCourse {
  code: string;
  credits: number;
  prerequisiteCodes: string[];
  collAttribute: string | null;
  seasons: Season[];
}

export interface CollRequirement {
  level: string;    // e.g. "COLL 100", "COLL 150"
  course: GeneratorCourse;
}

export interface CompletedCourse {
  code: string;
  credits: number;
  year: number;
  season: Season;
}

export interface PlannedSemester {
  year: number;
  season: Season;
}

export interface SectionOption {
  id: string;
  crn: string;
  days: string | null;
  startTime: string | null; // 12-h format e.g. "10:00am"
  endTime: string | null;
  year: number;
  season: Season;
}

export interface SchedulePreferences {
  /** Avoid sections that start before 9:30am. */
  avoidEarlyMorning?: boolean;
  /** Avoid sections whose days string contains "F". */
  noFridayClasses?: boolean;
  /** Maximum credits allowed per semester (default 18). */
  maxCreditsPerSemester?: number;
}

export interface GeneratorInput {
  student: { id: string; catalogYear: number };
  /** Courses already completed — will not be re-placed. */
  completedCourses: CompletedCourse[];
  /** All courses that must appear in the generated plan. */
  majorRequirements: GeneratorCourse[];
  /** COLL requirement definitions; each has exactly one satisfying course. */
  collRequirements: CollRequirement[];
  /** Pool to draw optional electives from. */
  electivePool: GeneratorCourse[];
  /** Minimum elective credits to schedule (generator adds until this is met). */
  electiveCreditsNeeded: number;
  /** Ordered list of semesters to fill. */
  plannedSemesters: PlannedSemester[];
  /** courseCode → all known sections (across any semester). */
  availableSections: Record<string, SectionOption[]>;
  preferences: SchedulePreferences;
  /**
   * Broad pool of any course that may be used to fill remaining semester capacity
   * after required courses and major-specific electives have been placed.
   * The generator uses this to bring each semester up to the target credit load.
   */
  fillPool?: GeneratorCourse[];
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface PlacedCourse {
  code: string;
  credits: number;
  /** null when no section data was provided for this course. */
  recommendedSectionId: string | null;
}

export interface GeneratedSemester {
  year: number;
  season: Season;
  courses: PlacedCourse[];
  totalCredits: number;
}

export interface GeneratedPlan {
  semesters: GeneratedSemester[];
  totalCredits: number;
}

export type GeneratorErrorType =
  | "PREREQUISITE_CYCLE"
  | "COURSE_NOT_AVAILABLE"
  | "CANNOT_FIT_COURSES";

export interface GeneratorError {
  type: GeneratorErrorType;
  message: string;
  courseCode?: string;
}

export interface GeneratorResult {
  success: boolean;
  plan?: GeneratedPlan;
  errors?: GeneratorError[];
}
