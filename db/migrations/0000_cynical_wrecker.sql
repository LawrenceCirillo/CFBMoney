CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gm_name" text,
	"program_slug" text NOT NULL,
	"program_name" text NOT NULL,
	"program_color" text NOT NULL,
	"budget_m" real NOT NULL,
	"alloc" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"expected_wins" real NOT NULL,
	"avg_margin" real NOT NULL,
	"off" real NOT NULL,
	"def" real NOT NULL,
	"st" real NOT NULL,
	"tags" jsonb NOT NULL,
	"best_win" jsonb,
	"worst_loss" jsonb,
	"games" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "seasons_wins_idx" ON "seasons" USING btree ("wins" DESC NULLS LAST);