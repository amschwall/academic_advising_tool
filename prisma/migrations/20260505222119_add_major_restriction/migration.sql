-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "majorRestriction" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "concentration" TEXT,
ADD COLUMN     "minor" TEXT,
ALTER COLUMN "major" SET DEFAULT 'Undecided';
