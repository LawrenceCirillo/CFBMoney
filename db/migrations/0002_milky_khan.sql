ALTER TABLE "seasons" ADD COLUMN "publish_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_publish_key_idx" ON "seasons" USING btree ("publish_key");