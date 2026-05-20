CREATE TYPE "public"."event_type" AS ENUM('opened', 'clicked', 'replied', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."lead_segment" AS ENUM('sme_importer', 'sme_exporter', 'fintech', 'ecommerce', 'freight', 'b2b_services');--> statement-breakpoint
CREATE TYPE "public"."lead_state" AS ENUM('new', 'enriched', 'scored', 'queued', 'active', 'lukewarm', 'hot', 'booked', 'stalled', 'disqualified', 'error');--> statement-breakpoint
CREATE TYPE "public"."signal_type" AS ENUM('import_activity', 'funding', 'hire', 'competitor', 'expansion');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"segment" "lead_segment" NOT NULL,
	"subject_line_a" text NOT NULL,
	"subject_line_b" text NOT NULL,
	"cta" text NOT NULL,
	"metrics" jsonb DEFAULT '{"sent":0,"opened":0,"clicked":0,"replied":0}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"campaign_step" integer DEFAULT 0,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"variant" text DEFAULT 'a' NOT NULL,
	"metric_target" text NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_role" text NOT NULL,
	"contact_email" text,
	"country" text NOT NULL,
	"industry" text NOT NULL,
	"state" "lead_state" DEFAULT 'new' NOT NULL,
	"score" integer DEFAULT 0,
	"segment" "lead_segment",
	"campaign_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" "signal_type" NOT NULL,
	"source" text NOT NULL,
	"value" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"variant" text DEFAULT 'a' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_lead_id_idx" ON "events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "leads_state_idx" ON "leads" USING btree ("state");--> statement-breakpoint
CREATE INDEX "leads_segment_idx" ON "leads" USING btree ("segment");--> statement-breakpoint
CREATE INDEX "leads_company_idx" ON "leads" USING btree ("company");--> statement-breakpoint
CREATE INDEX "leads_country_idx" ON "leads" USING btree ("country");--> statement-breakpoint
CREATE INDEX "signals_lead_id_idx" ON "signals" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "signals_type_idx" ON "signals" USING btree ("type");