// file: lib/scraper/store.ts

import type { ParsedSection, StoreResult } from "./types";

// Minimal structural type so callers can pass a real PrismaClient or a mock.
type PrismaLike = {
  course: {
    upsert: (args: {
      where: { code: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<{ id: string }>;
  };
  section: {
    upsert: (args: {
      where: { crn: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<{ id: string }>;
  };
};

/**
 * Persists a list of parsed sections to the database.
 *
 * For each section:
 *  1. Upsert the parent Course (keyed by `subject + courseNumber`, e.g. "HIST150").
 *  2. Upsert the Section (keyed by CRN).
 *
 * Returns counts of upserted courses and sections.
 */
export async function storeSections(
  sections: ParsedSection[],
  prisma: PrismaLike
): Promise<StoreResult> {
  let coursesUpserted = 0;
  let sectionsUpserted = 0;

  for (const s of sections) {
    const courseCode = `${s.subject}${s.courseNumber}`;

    const course = await prisma.course.upsert({
      where: { code: courseCode },
      create: {
        code: courseCode,
        title: s.title,
        credits: s.credits,
        department: s.subject,
        collAttribute: s.collAttribute,
        alv: s.alv,
        csi: s.csi,
        nqr: s.nqr,
      },
      update: {
        title: s.title,
        credits: s.credits,
        collAttribute: s.collAttribute,
        alv: s.alv,
        csi: s.csi,
        nqr: s.nqr,
      },
    });
    coursesUpserted++;

    await prisma.section.upsert({
      where: { crn: s.crn },
      create: {
        crn: s.crn,
        courseId: course.id,
        section: s.section,
        term: s.term,
        year: s.year,
        season: s.season,
        days: s.days,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location,
        instructor: s.instructor,
        capacity: s.capacity,
        enrolled: s.enrolled,
        status: s.status,
      },
      update: {
        section: s.section,
        term: s.term,
        year: s.year,
        season: s.season,
        days: s.days,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location,
        instructor: s.instructor,
        capacity: s.capacity,
        enrolled: s.enrolled,
        status: s.status,
      },
    });
    sectionsUpserted++;
  }

  return { coursesUpserted, sectionsUpserted };
}
