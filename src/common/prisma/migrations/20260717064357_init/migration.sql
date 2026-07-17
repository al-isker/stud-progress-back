-- CreateTable
CREATE TABLE "student" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "course" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "student_full_name_key" ON "student"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_refresh_token_key" ON "refresh_token"("refresh_token");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_student_id_key" ON "refresh_token"("student_id");

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
