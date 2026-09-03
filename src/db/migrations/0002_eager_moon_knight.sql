CREATE TYPE "public"."finance_statement_type" AS ENUM('BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW');--> statement-breakpoint
CREATE TABLE "finance_entities" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"legal_name_zh" text,
	"tax_id" text,
	"country" text DEFAULT 'CN' NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_filings" (
	"id" text PRIMARY KEY NOT NULL,
	"finance_entity_id" text NOT NULL,
	"period_end" timestamp NOT NULL,
	"source_file_name" text NOT NULL,
	"source_file_url" text NOT NULL,
	"warnings" text[] DEFAULT '{}' NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"statement_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"code" text,
	"label_zh" text NOT NULL,
	"label_ko" text,
	"side" text,
	"value" double precision,
	"compare_value" double precision
);
--> statement-breakpoint
CREATE TABLE "financial_statements" (
	"id" text PRIMARY KEY NOT NULL,
	"filing_id" text NOT NULL,
	"statement_type" "finance_statement_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_entities" ADD CONSTRAINT "finance_entities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_filings" ADD CONSTRAINT "financial_filings_finance_entity_id_finance_entities_id_fk" FOREIGN KEY ("finance_entity_id") REFERENCES "public"."finance_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_filings" ADD CONSTRAINT "financial_filings_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_line_items" ADD CONSTRAINT "financial_line_items_statement_id_financial_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."financial_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_filing_id_financial_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."financial_filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_entities_org_idx" ON "finance_entities" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_entities_org_tax_id_unique" ON "finance_entities" USING btree ("organization_id","tax_id");--> statement-breakpoint
CREATE INDEX "financial_filings_entity_idx" ON "financial_filings" USING btree ("finance_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_filings_entity_period_unique" ON "financial_filings" USING btree ("finance_entity_id","period_end");--> statement-breakpoint
CREATE INDEX "financial_line_items_statement_idx" ON "financial_line_items" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "financial_line_items_code_idx" ON "financial_line_items" USING btree ("code");--> statement-breakpoint
CREATE INDEX "financial_statements_filing_idx" ON "financial_statements" USING btree ("filing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_statements_filing_type_unique" ON "financial_statements" USING btree ("filing_id","statement_type");