ALTER TABLE "student" ADD COLUMN "external_portal_session_id" TEXT;

UPDATE "student" SET "external_portal_session_id" = '';

ALTER TABLE "student" ALTER COLUMN "external_portal_session_id" SET NOT NULL;