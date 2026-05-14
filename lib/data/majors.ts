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

/** A specific course that can satisfy a CreditRequirement elective slot. */
export interface ApprovedElective {
  code: string;
  title: string;
  credits: number;
}

export interface CreditRequirement {
  type: "credits";
  description: string;   // human-readable label, e.g. "Upper-division CSCI electives"
  credits: number;       // minimum credits required
  departments?: string[]; // course.department must be in this list (omit = any dept)
  minLevel?: number;     // course level (hundreds digit × 100) must be ≥ this value
  /**
   * Approved elective courses that satisfy this requirement.
   * When provided, the generator samples randomly from this list instead of
   * using a loose department/level filter against the catalog.
   */
  electiveCourses?: ApprovedElective[];
  /**
   * When true, the generator picks exactly ONE department from `departments`
   * (chosen at random) and builds a sequential course chain within that
   * department (e.g. 101 → 102 → 201 → 202).  Use for foreign-language
   * proficiency requirements where mixing languages is not allowed.
   */
  singleDepartment?: boolean;
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
      { type: "course", code: "CSCI140", title: "Introduction to Computer Science", credits: 3 },
      { type: "course", code: "CSCI141", title: "Data Structures",                  credits: 3, prerequisiteCodes: ["CSCI140"] },
      { type: "course", code: "CSCI301", title: "Algorithms",                        credits: 3, prerequisiteCodes: ["CSCI141"] },
      {
        type: "credits", description: "Upper-division CSCI electives", credits: 12,
        departments: ["CSCI"], minLevel: 300,
        electiveCourses: [
          { code: "CSCI303", title: "Computer Organization",   credits: 3 },
          { code: "CSCI304", title: "Operating Systems",        credits: 3 },
          { code: "CSCI312", title: "Programming Languages",    credits: 3 },
          { code: "CSCI315", title: "Artificial Intelligence",  credits: 3 },
          { code: "CSCI380", title: "Software Engineering",     credits: 3 },
          { code: "CSCI420", title: "Machine Learning",         credits: 3 },
          { code: "CSCI441", title: "Computer Networks",        credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Economics",
    type: "major",
    requirements: [
      { type: "course", code: "ECON101", title: "Principles of Macroeconomics", credits: 3 },
      { type: "course", code: "ECON102", title: "Principles of Microeconomics", credits: 3 },
      {
        type: "credits", description: "Upper-division ECON courses", credits: 15,
        departments: ["ECON"], minLevel: 300,
        electiveCourses: [
          { code: "ECON303", title: "Intermediate Microeconomics", credits: 3 },
          { code: "ECON304", title: "Intermediate Macroeconomics", credits: 3 },
          { code: "ECON401", title: "Econometrics",                credits: 3 },
          { code: "ECON410", title: "Game Theory",                 credits: 3 },
          { code: "ECON450", title: "Senior Thesis in Economics",  credits: 3 },
        ],
      },
    ],
  },
  {
    name: "History",
    type: "major",
    requirements: [
      {
        type: "credits", description: "HIST courses", credits: 30, departments: ["HIST"],
        electiveCourses: [
          { code: "HIST101", title: "World History to 1500",        credits: 3 },
          { code: "HIST102", title: "World History since 1500",     credits: 3 },
          { code: "HIST201", title: "American History to 1865",     credits: 3 },
          { code: "HIST202", title: "American History since 1865",  credits: 3 },
          { code: "HIST210", title: "European History 1500–1815",   credits: 3 },
          { code: "HIST211", title: "European History since 1815",  credits: 3 },
          { code: "HIST220", title: "African History",              credits: 3 },
          { code: "HIST230", title: "Latin American History",       credits: 3 },
          { code: "HIST301", title: "American History",             credits: 3 },
          { code: "HIST310", title: "Colonial America",             credits: 3 },
          { code: "HIST320", title: "The Civil War Era",            credits: 3 },
          { code: "HIST330", title: "20th-Century United States",   credits: 3 },
          { code: "HIST340", title: "Revolutionary Europe",         credits: 3 },
          { code: "HIST401", title: "Historiography",               credits: 3 },
          { code: "HIST410", title: "Seminar: American History",    credits: 3 },
          { code: "HIST420", title: "Seminar: World History",       credits: 3 },
        ],
      },
      {
        type: "credits", description: "Upper-division HIST courses", credits: 18,
        departments: ["HIST"], minLevel: 300,
        electiveCourses: [
          { code: "HIST301", title: "American History",           credits: 3 },
          { code: "HIST310", title: "Colonial America",           credits: 3 },
          { code: "HIST320", title: "The Civil War Era",          credits: 3 },
          { code: "HIST330", title: "20th-Century United States", credits: 3 },
          { code: "HIST340", title: "Revolutionary Europe",       credits: 3 },
          { code: "HIST401", title: "Historiography",             credits: 3 },
          { code: "HIST410", title: "Seminar: American History",  credits: 3 },
          { code: "HIST420", title: "Seminar: World History",     credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Government",
    type: "major",
    requirements: [
      {
        type: "credits", description: "GOVT courses", credits: 30, departments: ["GOVT"],
        electiveCourses: [
          { code: "GOVT101", title: "American Government",              credits: 3 },
          { code: "GOVT102", title: "Introduction to Comparative Politics", credits: 3 },
          { code: "GOVT103", title: "Introduction to International Relations", credits: 3 },
          { code: "GOVT201", title: "Political Theory",                 credits: 3 },
          { code: "GOVT210", title: "Constitutional Law",               credits: 3 },
          { code: "GOVT220", title: "Congress and the Presidency",      credits: 3 },
          { code: "GOVT301", title: "Comparative Politics",             credits: 3 },
          { code: "GOVT305", title: "Political Parties and Elections",  credits: 3 },
          { code: "GOVT310", title: "International Security",           credits: 3 },
          { code: "GOVT312", title: "Constitutional Law",               credits: 3 },
          { code: "GOVT315", title: "International Relations",          credits: 3 },
          { code: "GOVT320", title: "Comparative Democracy",            credits: 3 },
          { code: "GOVT330", title: "US Foreign Policy",                credits: 3 },
          { code: "GOVT401", title: "Political Research Methods",       credits: 3 },
          { code: "GOVT410", title: "Seminar: International Relations", credits: 3 },
          { code: "GOVT421", title: "Senior Seminar in Government",     credits: 3 },
        ],
      },
      {
        type: "credits", description: "Upper-division GOVT courses", credits: 15,
        departments: ["GOVT"], minLevel: 300,
        electiveCourses: [
          { code: "GOVT301", title: "Comparative Politics",             credits: 3 },
          { code: "GOVT305", title: "Political Parties and Elections",  credits: 3 },
          { code: "GOVT310", title: "International Security",           credits: 3 },
          { code: "GOVT312", title: "Constitutional Law",               credits: 3 },
          { code: "GOVT315", title: "International Relations",          credits: 3 },
          { code: "GOVT320", title: "Comparative Democracy",            credits: 3 },
          { code: "GOVT330", title: "US Foreign Policy",                credits: 3 },
          { code: "GOVT401", title: "Political Research Methods",       credits: 3 },
          { code: "GOVT410", title: "Seminar: International Relations", credits: 3 },
          { code: "GOVT421", title: "Senior Seminar in Government",     credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Biology",
    type: "major",
    requirements: [
      { type: "course", code: "BIOL220", title: "General Biology I",  credits: 4 },
      { type: "course", code: "BIOL221", title: "General Biology II", credits: 4, prerequisiteCodes: ["BIOL220"] },
      {
        type: "credits", description: "Upper-division BIOL courses", credits: 12,
        departments: ["BIOL"], minLevel: 300,
        electiveCourses: [
          { code: "BIOL305", title: "Cell Biology",   credits: 3 },
          { code: "BIOL310", title: "Genetics",       credits: 3 },
          { code: "BIOL350", title: "Ecology",        credits: 3 },
          { code: "BIOL401", title: "Senior Seminar", credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Psychology",
    type: "major",
    requirements: [
      { type: "course", code: "PSYC201", title: "Introduction to Psychology", credits: 3 },
      {
        type: "credits", description: "PSYC electives", credits: 21, departments: ["PSYC"],
        electiveCourses: [
          { code: "PSYC301", title: "Research Methods in Psychology", credits: 3 },
          { code: "PSYC302", title: "Statistics for Psychology",      credits: 3 },
          { code: "PSYC311", title: "Developmental Psychology",       credits: 3 },
          { code: "PSYC321", title: "Social Psychology",              credits: 3 },
          { code: "PSYC401", title: "Abnormal Psychology",            credits: 3 },
          { code: "PSYC441", title: "Cognitive Psychology",           credits: 3 },
          { code: "PSYC451", title: "Capstone in Psychology",         credits: 3 },
        ],
      },
    ],
  },
  {
    name: "English",
    type: "major",
    requirements: [
      {
        type: "credits", description: "ENGL courses", credits: 30, departments: ["ENGL"],
        electiveCourses: [
          { code: "ENGL101", title: "Academic Writing",                credits: 3 },
          { code: "ENGL201", title: "Literature and Society",          credits: 3 },
          { code: "ENGL210", title: "British Literature to 1660",      credits: 3 },
          { code: "ENGL211", title: "British Literature since 1660",   credits: 3 },
          { code: "ENGL220", title: "American Literature to 1865",     credits: 3 },
          { code: "ENGL221", title: "American Literature since 1865",  credits: 3 },
          { code: "ENGL230", title: "World Literature in English",     credits: 3 },
          { code: "ENGL301", title: "Advanced Writing",                credits: 3 },
          { code: "ENGL305", title: "Shakespeare",                     credits: 3 },
          { code: "ENGL310", title: "The Novel",                       credits: 3 },
          { code: "ENGL315", title: "Poetry",                          credits: 3 },
          { code: "ENGL320", title: "Creative Writing: Fiction",       credits: 3 },
          { code: "ENGL325", title: "Creative Writing: Poetry",        credits: 3 },
          { code: "ENGL401", title: "Seminar: Modern Literature",      credits: 3 },
          { code: "ENGL410", title: "Seminar: American Literature",    credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Mathematics",
    type: "major",
    requirements: [
      { type: "course", code: "MATH111", title: "Calculus I",      credits: 4 },
      { type: "course", code: "MATH112", title: "Calculus II",     credits: 4, prerequisiteCodes: ["MATH111"] },
      { type: "course", code: "MATH307", title: "Linear Algebra",  credits: 3, prerequisiteCodes: ["MATH112"] },
      {
        type: "credits", description: "Upper-division MATH courses", credits: 12,
        departments: ["MATH"], minLevel: 300,
        electiveCourses: [
          { code: "MATH302", title: "Abstract Algebra",        credits: 4 },
          { code: "MATH311", title: "Real Analysis I",         credits: 4 },
          { code: "MATH312", title: "Real Analysis II",        credits: 4 },
          { code: "MATH315", title: "Number Theory",           credits: 4 },
          { code: "MATH351", title: "Probability",             credits: 4 },
          { code: "MATH352", title: "Mathematical Statistics", credits: 4 },
          { code: "MATH403", title: "Topology",                credits: 4 },
          { code: "MATH410", title: "Complex Analysis",        credits: 4 },
          { code: "MATH420", title: "Differential Equations",  credits: 4 },
        ],
      },
    ],
  },
  {
    name: "Physics",
    type: "major",
    requirements: [
      { type: "course", code: "PHYS101", title: "General Physics I",  credits: 4 },
      { type: "course", code: "PHYS102", title: "General Physics II", credits: 4, prerequisiteCodes: ["PHYS101"] },
      {
        type: "credits", description: "Upper-division PHYS courses", credits: 15,
        departments: ["PHYS"], minLevel: 300,
        electiveCourses: [
          { code: "PHYS301", title: "Classical Mechanics",     credits: 4 },
          { code: "PHYS302", title: "Quantum Mechanics I",     credits: 4 },
          { code: "PHYS303", title: "Electricity & Magnetism", credits: 4 },
          { code: "PHYS310", title: "Thermodynamics",          credits: 3 },
          { code: "PHYS315", title: "Modern Physics",          credits: 3 },
          { code: "PHYS401", title: "Statistical Mechanics",   credits: 4 },
          { code: "PHYS404", title: "Quantum Mechanics II",    credits: 4 },
          { code: "PHYS410", title: "Nuclear Physics",         credits: 4 },
          { code: "PHYS420", title: "Astrophysics",            credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Chemistry",
    type: "major",
    requirements: [
      { type: "course", code: "CHEM103", title: "General Chemistry I",  credits: 4 },
      { type: "course", code: "CHEM104", title: "General Chemistry II", credits: 4, prerequisiteCodes: ["CHEM103"] },
      {
        type: "credits", description: "Upper-division CHEM courses", credits: 12,
        departments: ["CHEM"], minLevel: 300,
        electiveCourses: [
          { code: "CHEM301", title: "Organic Chemistry I",        credits: 4 },
          { code: "CHEM302", title: "Organic Chemistry II",       credits: 4 },
          { code: "CHEM303", title: "Physical Chemistry I",       credits: 4 },
          { code: "CHEM304", title: "Physical Chemistry II",      credits: 4 },
          { code: "CHEM310", title: "Analytical Chemistry",       credits: 4 },
          { code: "CHEM315", title: "Inorganic Chemistry",        credits: 4 },
          { code: "CHEM401", title: "Biochemistry I",             credits: 4 },
          { code: "CHEM410", title: "Advanced Organic Chemistry", credits: 4 },
        ],
      },
    ],
  },
  {
    name: "Sociology",
    type: "major",
    requirements: [
      {
        type: "credits", description: "SOCI courses", credits: 30, departments: ["SOCI"],
        electiveCourses: [
          { code: "SOCI101", title: "Introduction to Sociology",    credits: 3 },
          { code: "SOCI201", title: "Social Inequality",            credits: 3 },
          { code: "SOCI210", title: "Race and Ethnicity",           credits: 3 },
          { code: "SOCI220", title: "Gender and Society",           credits: 3 },
          { code: "SOCI230", title: "Urban Sociology",              credits: 3 },
          { code: "SOCI301", title: "Research Methods in Sociology",credits: 3 },
          { code: "SOCI310", title: "Sociological Theory",          credits: 3 },
          { code: "SOCI315", title: "Criminology",                  credits: 3 },
          { code: "SOCI320", title: "Medical Sociology",            credits: 3 },
          { code: "SOCI401", title: "Sociological Theory",          credits: 3 },
          { code: "SOCI410", title: "Seminar: Global Inequality",   credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Neuroscience",
    type: "major",
    requirements: [
      { type: "course", code: "BIOL220", title: "General Biology I", credits: 4 },
      {
        type: "credits", description: "Neuroscience core courses", credits: 24,
        departments: ["BIOL", "PSYC", "CHEM"],
        electiveCourses: [
          { code: "BIOL305", title: "Cell Biology",                credits: 3 },
          { code: "BIOL310", title: "Genetics",                    credits: 3 },
          { code: "BIOL350", title: "Ecology",                     credits: 3 },
          { code: "PSYC201", title: "Introduction to Psychology",  credits: 3 },
          { code: "PSYC301", title: "Research Methods",            credits: 3 },
          { code: "PSYC311", title: "Developmental Psychology",    credits: 3 },
          { code: "PSYC441", title: "Cognitive Psychology",        credits: 3 },
          { code: "CHEM103", title: "General Chemistry I",         credits: 4 },
          { code: "CHEM104", title: "General Chemistry II",        credits: 4 },
        ],
      },
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
      {
        type: "credits", description: "HIST courses", credits: 18, departments: ["HIST"],
        electiveCourses: [
          { code: "HIST101", title: "World History to 1500",        credits: 3 },
          { code: "HIST102", title: "World History since 1500",     credits: 3 },
          { code: "HIST201", title: "American History to 1865",     credits: 3 },
          { code: "HIST202", title: "American History since 1865",  credits: 3 },
          { code: "HIST301", title: "American History",             credits: 3 },
          { code: "HIST310", title: "Colonial America",             credits: 3 },
          { code: "HIST320", title: "The Civil War Era",            credits: 3 },
          { code: "HIST401", title: "Historiography",               credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Mathematics",
    type: "minor",
    requirements: [
      { type: "course", code: "MATH111", title: "Calculus I",  credits: 4 },
      { type: "course", code: "MATH112", title: "Calculus II", credits: 4, prerequisiteCodes: ["MATH111"] },
      {
        type: "credits", description: "Upper MATH courses", credits: 10, departments: ["MATH"], minLevel: 200,
        electiveCourses: [
          { code: "MATH211", title: "Applied Statistics", credits: 3 },
          { code: "MATH307", title: "Linear Algebra",     credits: 3 },
          { code: "MATH302", title: "Abstract Algebra",   credits: 4 },
          { code: "MATH311", title: "Real Analysis I",    credits: 4 },
          { code: "MATH351", title: "Probability",        credits: 4 },
        ],
      },
    ],
  },
  {
    name: "Computer Science",
    type: "minor",
    requirements: [
      { type: "course", code: "CSCI140", title: "Introduction to Computer Science", credits: 3 },
      { type: "course", code: "CSCI141", title: "Data Structures", credits: 3, prerequisiteCodes: ["CSCI140"] },
      {
        type: "credits", description: "CSCI electives", credits: 9, departments: ["CSCI"],
        electiveCourses: [
          { code: "CSCI243", title: "Discrete Mathematics",   credits: 3 },
          { code: "CSCI301", title: "Algorithms",             credits: 3 },
          { code: "CSCI303", title: "Computer Organization",  credits: 3 },
          { code: "CSCI304", title: "Operating Systems",      credits: 3 },
          { code: "CSCI312", title: "Programming Languages",  credits: 3 },
          { code: "CSCI315", title: "Artificial Intelligence",credits: 3 },
          { code: "CSCI380", title: "Software Engineering",   credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Economics",
    type: "minor",
    requirements: [
      { type: "course", code: "ECON101", title: "Principles of Macroeconomics", credits: 3 },
      { type: "course", code: "ECON102", title: "Principles of Microeconomics", credits: 3 },
      {
        type: "credits", description: "ECON electives", credits: 12, departments: ["ECON"],
        electiveCourses: [
          { code: "ECON201", title: "Intermediate Statistics for Economics", credits: 3 },
          { code: "ECON303", title: "Intermediate Microeconomics",           credits: 3 },
          { code: "ECON304", title: "Intermediate Macroeconomics",           credits: 3 },
          { code: "ECON401", title: "Econometrics",                          credits: 3 },
          { code: "ECON410", title: "Game Theory",                           credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Philosophy",
    type: "minor",
    requirements: [
      {
        type: "credits", description: "PHIL courses", credits: 18, departments: ["PHIL"],
        electiveCourses: [
          { code: "PHIL201", title: "Ethics",              credits: 3 },
          { code: "PHIL210", title: "Logic",               credits: 3 },
          { code: "PHIL220", title: "Epistemology",        credits: 3 },
          { code: "PHIL301", title: "Philosophy of Mind",  credits: 3 },
          { code: "PHIL310", title: "Political Philosophy",credits: 3 },
          { code: "PHIL401", title: "Metaphysics",         credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Psychology",
    type: "minor",
    requirements: [
      { type: "course", code: "PSYC201", title: "Introduction to Psychology", credits: 3 },
      {
        type: "credits", description: "PSYC electives", credits: 15, departments: ["PSYC"],
        electiveCourses: [
          { code: "PSYC301", title: "Research Methods in Psychology", credits: 3 },
          { code: "PSYC311", title: "Developmental Psychology",       credits: 3 },
          { code: "PSYC321", title: "Social Psychology",              credits: 3 },
          { code: "PSYC401", title: "Abnormal Psychology",            credits: 3 },
          { code: "PSYC441", title: "Cognitive Psychology",           credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Sociology",
    type: "minor",
    requirements: [
      {
        type: "credits", description: "SOCI courses", credits: 18, departments: ["SOCI"],
        electiveCourses: [
          { code: "SOCI101", title: "Introduction to Sociology",     credits: 3 },
          { code: "SOCI201", title: "Social Inequality",             credits: 3 },
          { code: "SOCI301", title: "Research Methods in Sociology", credits: 3 },
          { code: "SOCI401", title: "Sociological Theory",           credits: 3 },
          { code: "SOCI310", title: "Sociological Theory",           credits: 3 },
          { code: "SOCI315", title: "Criminology",                   credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Data Science",
    type: "minor",
    requirements: [
      { type: "course", code: "CSCI140", title: "Introduction to Computer Science", credits: 3 },
      { type: "course", code: "MATH211", title: "Applied Statistics", credits: 3 },
      {
        type: "credits", description: "Data Science electives", credits: 12,
        departments: ["CSCI", "MATH", "ECON"],
        electiveCourses: [
          { code: "CSCI420", title: "Machine Learning",              credits: 3 },
          { code: "CSCI315", title: "Artificial Intelligence",       credits: 3 },
          { code: "ECON401", title: "Econometrics",                  credits: 3 },
          { code: "MATH351", title: "Probability",                   credits: 4 },
          { code: "MATH352", title: "Mathematical Statistics",       credits: 4 },
        ],
      },
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
      { type: "course",  code: "CSCI420", title: "Machine Learning", credits: 3 },
      {
        type: "credits", description: "Data Science electives", credits: 6,
        departments: ["CSCI", "MATH", "ECON"],
        electiveCourses: [
          { code: "CSCI315", title: "Artificial Intelligence",  credits: 3 },
          { code: "ECON401", title: "Econometrics",             credits: 3 },
          { code: "MATH351", title: "Probability",              credits: 4 },
          { code: "MATH352", title: "Mathematical Statistics",  credits: 4 },
        ],
      },
    ],
  },
  {
    name: "International Relations",
    type: "concentration",
    applicableMajors: ["Government", "History", "Economics", "Sociology"],
    requirements: [
      {
        type: "credits", description: "GOVT international courses", credits: 12,
        departments: ["GOVT"],
        electiveCourses: [
          { code: "GOVT103", title: "Introduction to International Relations", credits: 3 },
          { code: "GOVT310", title: "International Security",                  credits: 3 },
          { code: "GOVT315", title: "International Relations",                 credits: 3 },
          { code: "GOVT330", title: "US Foreign Policy",                       credits: 3 },
          { code: "GOVT410", title: "Seminar: International Relations",        credits: 3 },
        ],
      },
    ],
  },
  {
    name: "Computational Biology",
    type: "concentration",
    applicableMajors: ["Biology", "Computer Science", "Neuroscience", "Chemistry"],
    requirements: [
      {
        type: "credits", description: "Computational Biology courses", credits: 15,
        departments: ["BIOL", "CSCI"],
        electiveCourses: [
          { code: "BIOL305", title: "Cell Biology",             credits: 3 },
          { code: "BIOL310", title: "Genetics",                 credits: 3 },
          { code: "CSCI315", title: "Artificial Intelligence",  credits: 3 },
          { code: "CSCI420", title: "Machine Learning",         credits: 3 },
          { code: "CSCI141", title: "Data Structures",          credits: 3 },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// W&M COLL Curriculum (gen-ed requirements)
// ---------------------------------------------------------------------------

export const COLL_CURRICULUM: ProgramDefinition = {
  name: "W&M COLL Curriculum",
  type: "gen-ed",
  requirements: [
    // COLL 100 / 150 — first-year writing & seminar
    { type: "credits", description: "COLL 100/150: First-Year Writing & Seminar", credits: 6 },

    // COLL 200 domain areas — 1 course each (introductory domain exposure)
    { type: "attribute", description: "COLL 200: Arts, Letters & Values (ALV)",                   attribute: "alv", credits: 3, count: 1 },
    { type: "attribute", description: "COLL 200: Culture, Society & Identity (CSI)",              attribute: "csi", credits: 3, count: 1 },
    { type: "attribute", description: "COLL 200: Natural World & Quantitative Reasoning (NQR)",   attribute: "nqr", credits: 3, count: 1 },

    // Non-200 domain — one additional course per domain at any level
    { type: "attribute", description: "Additional ALV — Arts, Letters & Values (any level)",       attribute: "alv", credits: 3, count: 2 },
    { type: "attribute", description: "Additional CSI — Culture, Society & Identity (any level)",  attribute: "csi", credits: 3, count: 2 },
    { type: "attribute", description: "Additional NQR — Natural World & Quantitative Reasoning (any level)", attribute: "nqr", credits: 3, count: 2 },

    // Foreign Language — proficiency through 202 (or equivalent, typically 12 cr)
    {
      type: "credits",
      description: "Foreign Language Proficiency (through 202 level)",
      credits: 12,
      departments: ["CHIN", "FREN", "GERM", "HISP", "ITAL", "JAPN", "RUSS", "ARAB", "GREK", "LATN"],
      singleDepartment: true,
    },

    // Creative & Performing Arts — 1 course
    {
      type: "credits",
      description: "Creative & Performing Arts",
      credits: 3,
      departments: ["MUSC", "THEA", "DANC", "ARTH"],
    },

    // COLL 300 — upper-division writing-intensive (any 300+ course)
    { type: "credits", description: "COLL 300: Upper-Division Writing Intensive", credits: 3, minLevel: 300 },
    // COLL 400 — senior capstone (any 400+ course)
    { type: "credits", description: "COLL 400: Senior Capstone", credits: 3, minLevel: 400 },
  ],
};
