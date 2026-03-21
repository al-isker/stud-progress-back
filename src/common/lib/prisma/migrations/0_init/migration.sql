-- CreateEnum
CREATE TYPE "ControlType" AS ENUM ('EXAM', 'GRADED_TEST', 'TEST');

-- CreateEnum
CREATE TYPE "GradeStatus" AS ENUM ('PASS', 'FAIL', 'EMPTY');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('MARK', 'EMPTY', 'ABSENCE', 'UPWORKED');

-- CreateTable
CREATE TABLE "student" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "encrypted_password" TEXT NOT NULL,
    "course" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "external_portal_session_id" TEXT NOT NULL,
    "expo_push_token" TEXT,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" SERIAL NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expired_at" TIMESTAMP(3) NOT NULL,
    "student_id" INTEGER NOT NULL,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject" (
    "id" SERIAL NOT NULL,
    "nameId" INTEGER NOT NULL,
    "control_type" "ControlType",
    "student_id" INTEGER NOT NULL,

    CONSTRAINT "subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_name" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "subject_name_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade" (
    "id" SERIAL NOT NULL,
    "semester" INTEGER NOT NULL,
    "status" "GradeStatus" NOT NULL,
    "date" TIMESTAMP(3),
    "mark" INTEGER,
    "is_new" BOOLEAN NOT NULL,
    "subject_id" INTEGER NOT NULL,

    CONSTRAINT "grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_by_semester" (
    "id" SERIAL NOT NULL,
    "semester" INTEGER NOT NULL,
    "average_mark" DOUBLE PRECISION,
    "subject_id" INTEGER NOT NULL,

    CONSTRAINT "rating_by_semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" SERIAL NOT NULL,
    "status" "EventStatus" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mark" INTEGER,
    "is_new" BOOLEAN NOT NULL,
    "rating_by_semester_id" INTEGER NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_full_name_key" ON "student"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_refresh_token_key" ON "refresh_token"("refresh_token");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_student_id_key" ON "refresh_token"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_name_name_key" ON "subject_name"("name");

-- CreateIndex
CREATE UNIQUE INDEX "grade_subject_id_key" ON "grade"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "rating_by_semester_semester_subject_id_key" ON "rating_by_semester"("semester", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_date_rating_by_semester_id_key" ON "event"("date", "rating_by_semester_id");

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject" ADD CONSTRAINT "subject_nameId_fkey" FOREIGN KEY ("nameId") REFERENCES "subject_name"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject" ADD CONSTRAINT "subject_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade" ADD CONSTRAINT "grade_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_by_semester" ADD CONSTRAINT "rating_by_semester_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_rating_by_semester_id_fkey" FOREIGN KEY ("rating_by_semester_id") REFERENCES "rating_by_semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

