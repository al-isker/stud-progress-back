/*
  Warnings:

  - You are about to drop the column `external_portal_session_id` on the `student` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "student" DROP COLUMN "external_portal_session_id",
ADD COLUMN     "external_portal_cookie" TEXT;
