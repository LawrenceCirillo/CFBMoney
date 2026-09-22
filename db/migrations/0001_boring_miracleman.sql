ALTER TABLE "seasons" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "sim_version" integer;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "data_fingerprint" text;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "seasons_verified_wins_idx" ON "seasons" USING btree ("verified","wins" DESC NULLS LAST);