CREATE TABLE IF NOT EXISTS "public"."archive_market_m5_log" (
    "ticker" integer PRIMARY KEY,
    "archived_until" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "public"."archive_market_m5_log" OWNER TO "postgres";

GRANT ALL ON TABLE "public"."archive_market_m5_log" TO "anon";
GRANT ALL ON TABLE "public"."archive_market_m5_log" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_market_m5_log" TO "service_role";
