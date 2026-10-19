ALTER TABLE "user" ADD COLUMN "email" TEXT;
ALTER TABLE "user" ADD COLUMN "email_verified_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

CREATE TABLE "auth_token" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "purpose" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_token_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "auth_token_token_hash_key" ON "auth_token"("token_hash");
CREATE INDEX "auth_token_purpose_created_at_idx" ON "auth_token"("purpose", "created_at");

CREATE TABLE "auth_attempt" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_attempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auth_attempt_key_created_at_idx" ON "auth_attempt"("key", "created_at");
