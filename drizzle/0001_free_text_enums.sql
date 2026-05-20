-- Migration: Remove leadSegment and signalType enums → free text
-- Also adds notes jsonb column to leads for BD outcome logging

-- 1. Drop the enum-typed column constraint on leads.segment
ALTER TABLE "leads" ALTER COLUMN "segment" TYPE text USING "segment"::text;

-- 2. Drop the enum-typed column constraint on signals.type
ALTER TABLE "signals" ALTER COLUMN "type" TYPE text USING "type"::text;

-- 3. Drop the enum-typed column constraint on campaigns.segment
ALTER TABLE "campaigns" ALTER COLUMN "segment" TYPE text USING "segment"::text;

-- 4. Add notes column to leads
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "notes" jsonb DEFAULT '[]'::jsonb;

-- 5. Drop the now-unused enum types
DROP TYPE IF EXISTS "public"."lead_segment";
DROP TYPE IF EXISTS "public"."signal_type";
