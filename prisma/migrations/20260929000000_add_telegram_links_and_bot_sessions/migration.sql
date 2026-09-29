-- Telegram bot: account binding + DB-backed bot sessions
CREATE TABLE "telegram_links" (
    "id" TEXT NOT NULL,
    "telegram_user_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "displayName" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_links_telegram_user_id_key" ON "telegram_links"("telegram_user_id");
CREATE UNIQUE INDEX "telegram_links_user_id_key" ON "telegram_links"("user_id");

ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bot sessions: survive deploys (in-memory Map was the LINE bot's weakest point)
CREATE TABLE "bot_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bot_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_sessions_user_id_kind_key" ON "bot_sessions"("user_id", "kind");
CREATE INDEX "bot_sessions_expires_at_idx" ON "bot_sessions"("expires_at");

ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;