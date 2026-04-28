-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "crn" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" "Season" NOT NULL,
    "days" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "location" TEXT,
    "instructor" TEXT,
    "capacity" INTEGER,
    "enrolled" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'A',

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Section_crn_key" ON "Section"("crn");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
