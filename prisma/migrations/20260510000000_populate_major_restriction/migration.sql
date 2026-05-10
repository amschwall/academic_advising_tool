-- Populate majorRestriction for law-school courses so they are not
-- placed in schedules for students enrolled in other programs.
UPDATE "Course"
SET "majorRestriction" = department
WHERE department = 'LAW'
  AND "majorRestriction" IS NULL;
