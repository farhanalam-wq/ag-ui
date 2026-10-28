CREATE TABLE "intent_cluster_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"score" numeric,
	CONSTRAINT "intent_cluster_members_unique" UNIQUE("cluster_id","conversation_id")
);
--> statement-breakpoint
CREATE TABLE "intent_cluster_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"period_start" date,
	"period_end" date,
	"convo_count" integer DEFAULT 0 NOT NULL,
	"cluster_count" integer DEFAULT 0 NOT NULL,
	"model_versions" jsonb,
	"error_sample" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intent_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"label" text NOT NULL,
	"summary" text,
	"query_count" integer DEFAULT 0 NOT NULL,
	"ungrounded" integer DEFAULT 0 NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"top_queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"competitor_mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid,
	"contact_name" text,
	"email" text,
	"phone" text,
	"bant" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tech_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extra_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"first_message" text,
	"confidence" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_feedback_message_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "session_hash" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "visitor_hash" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "intent_cluster_members" ADD CONSTRAINT "intent_cluster_members_cluster_id_intent_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."intent_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_cluster_members" ADD CONSTRAINT "intent_cluster_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_cluster_runs" ADD CONSTRAINT "intent_cluster_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_clusters" ADD CONSTRAINT "intent_clusters_run_id_intent_cluster_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."intent_cluster_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_clusters" ADD CONSTRAINT "intent_clusters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intent_cluster_members_conversation_idx" ON "intent_cluster_members" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "intent_cluster_runs_company_created_idx" ON "intent_cluster_runs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "intent_clusters_company_run_idx" ON "intent_clusters" USING btree ("company_id","run_id");--> statement-breakpoint
CREATE INDEX "intent_clusters_run_idx" ON "intent_clusters" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "leads_company_status_created_idx" ON "leads" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "leads_conversation_idx" ON "leads" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_company_email_unique" ON "leads" USING btree ("company_id",lower("email"));--> statement-breakpoint
CREATE INDEX "message_feedback_company_created_idx" ON "message_feedback" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "message_feedback_conversation_idx" ON "message_feedback" USING btree ("conversation_id");