-- Isolated test fixture derived from supplied public column/type metadata.
-- Business defaults/checks retained; required-column constraints and unrelated
-- triggers/FKs are omitted. Participant helpers are stubs, not live RLS evidence.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
create table public."Users"(user_id uuid primary key);
create type public."user_role" as enum ('client','freelancer','admin');
create type public."verification_status" as enum ('pending','approved','rejected');
create type public."service_status" as enum ('Active','Paused','Archived');
create type public."project_status" as enum ('pending','active','revision','completed','cancelled');
create type public."milestone_status" as enum ('pending','in_progress','submitted','revision_requested','approved','overdue');
create type public."contract_status" as enum ('draft','pending_client','pending_freelancer','active','rejected','cancelled','completed','pending');
create type public."job_application_status" as enum ('pending','shortlisted','accepted','rejected','withdrawn','in_review');
create table public."client_profiles" (
"user_id" uuid,
"created_at" timestamptz default now(),
"updated_at" timestamptz default now(),
"client_id" uuid default gen_random_uuid()
);
create table public."contracts" (
"contract_id" uuid default gen_random_uuid(),
"order_id" uuid,
"final_price" numeric,
"delivery_time_days" int4,
"revisions_count" int4 default 0,
"terms" text,
"status" contract_status default 'pending'::contract_status,
"client_signed_at" timestamptz,
"freelancer_signed_at" timestamptz,
"created_at" timestamptz default now(),
"updated_at" timestamptz default now(),
"application_id" uuid
);
create table public."freelancer_profiles" (
"freelancer_id" uuid,
"user_id" uuid,
"headline" varchar,
"hourly_rate" numeric,
"created_at" timestamp default now(),
"verification_status" verification_status,
"years_of_experience" int4,
"employment_preference" varchar,
"portfolio_website" text,
"linkedin_url" text,
"github_url" text,
"resume_url" text,
"government_id_url" text,
"portfolio_sample_urls" text[],
"certification_urls" text[]
);
create table public."milestones" (
"milestone_id" uuid default gen_random_uuid(),
"project_id" uuid,
"title" text,
"description" text,
"amount" numeric,
"due_date" date,
"status" milestone_status default 'pending'::milestone_status,
"created_at" timestamptz default now(),
"display_order" int4 default 1
);
create table public."notifications" (
"notification_id" uuid default gen_random_uuid(),
"user_id" uuid,
"type" text,
"title" text,
"message" text,
"related_id" uuid,
"is_read" bool default false,
"created_at" timestamptz default now()
);
create table public."payments" (
"payment_id" uuid default gen_random_uuid(),
"order_id" uuid,
"project_id" uuid,
"payer_id" uuid,
"amount" numeric,
"status" text,
"payment_method" text,
"transaction_reference" text,
"created_at" timestamptz default now(),
"provider" text,
"livemode" bool,
"currency" text,
"provider_payment_id" text,
"paid_at" timestamptz,
"updated_at" timestamptz default now()
);
create table public."project_cancellations" (
"cancellation_id" uuid default gen_random_uuid(),
"order_id" uuid,
"requested_by" uuid,
"reason" text,
"status" text default 'requested'::text,
"responded_by" uuid,
"response" text,
"created_at" timestamptz default now(),
"responded_at" timestamptz,
"cancelled_at" timestamptz
);
create table public."project_disputes" (
"dispute_id" uuid default gen_random_uuid(),
"project_id" uuid,
"milestone_id" uuid,
"opened_by" uuid,
"category" text,
"description" text,
"status" text default 'open'::text,
"evidence_path" text,
"evidence_name" text,
"admin_notes" text default ''::text,
"resolution" text,
"resolution_action" text,
"reviewed_by" uuid,
"created_at" timestamptz default now(),
"resolved_at" timestamptz
);
create table public."project_submissions" (
"submission_id" uuid default gen_random_uuid(),
"project_id" uuid,
"milestone_id" uuid,
"author_id" uuid,
"body" text default ''::text,
"link" text,
"attachment_path" text,
"attachment_name" text,
"kind" text,
"status" text default 'submitted'::text,
"created_at" timestamptz default now(),
"reviewed_at" timestamptz
);
create table public."projects" (
"project_id" uuid default gen_random_uuid(),
"freelancer_id" uuid,
"title" varchar,
"description" text,
"budget" numeric,
"status" project_status default 'pending'::project_status,
"start_date" date,
"due_date" date,
"completed_at" timestamptz,
"created_at" timestamptz default now(),
"updated_at" timestamptz default now(),
"order_id" uuid,
"client_id" uuid,
"application_id" uuid
);
create table public."service_orders" (
"order_id" uuid default gen_random_uuid(),
"service_id" uuid,
"freelancer_id" uuid,
"status" text default 'pending'::text,
"created_at" timestamptz default now(),
"updated_at" timestamptz default now(),
"client_id" uuid,
"job_id" uuid,
"application_id" uuid
);
alter table public."client_profiles" add constraint "client_profiles_pkey" PRIMARY KEY (client_id);
alter table public."client_profiles" add constraint "client_profiles_user_id_key" UNIQUE (user_id);
alter table public."contracts" add constraint "contracts_delivery_time_days_check" CHECK ((delivery_time_days > 0));
alter table public."contracts" add constraint "contracts_exactly_one_source_check" CHECK (((order_id IS NOT NULL) <> (application_id IS NOT NULL)));
alter table public."contracts" add constraint "contracts_final_price_check" CHECK ((final_price >= (0)::numeric));
alter table public."contracts" add constraint "contracts_order_id_key" UNIQUE (order_id);
alter table public."contracts" add constraint "contracts_order_or_application_check" CHECK ((NOT ((order_id IS NOT NULL) AND (application_id IS NOT NULL))));
alter table public."contracts" add constraint "contracts_pkey" PRIMARY KEY (contract_id);
alter table public."contracts" add constraint "contracts_revisions_count_check" CHECK ((revisions_count >= 0));
alter table public."freelancer_profiles" add constraint "freelancer_profile_pkey" PRIMARY KEY (freelancer_id);
alter table public."freelancer_profiles" add constraint "freelancer_profiles_user_id_key" UNIQUE (user_id);
alter table public."milestones" add constraint "milestones_pkey" PRIMARY KEY (milestone_id);
alter table public."notifications" add constraint "notifications_pkey" PRIMARY KEY (notification_id);
alter table public."payments" add constraint "payments_pkey" PRIMARY KEY (payment_id);
alter table public."payments" add constraint "payments_status_check" CHECK (((status IS NULL) OR (status = ANY (ARRAY['pending'::text, 'paid'::text]))));
alter table public."project_cancellations" add constraint "project_cancellations_pkey" PRIMARY KEY (cancellation_id);
alter table public."project_cancellations" add constraint "project_cancellations_reason_check" CHECK (((length(btrim(reason)) >= 1) AND (length(btrim(reason)) <= 5000)));
alter table public."project_cancellations" add constraint "project_cancellations_status_check" CHECK ((status = ANY (ARRAY['requested'::text, 'accepted'::text, 'rejected'::text])));
alter table public."project_disputes" add constraint "project_disputes_category_check" CHECK ((category = ANY (ARRAY['scope'::text, 'delivery'::text, 'communication'::text, 'quality'::text, 'other'::text])));
alter table public."project_disputes" add constraint "project_disputes_description_check" CHECK (((length(btrim(description)) >= 1) AND (length(btrim(description)) <= 10000)));
alter table public."project_disputes" add constraint "project_disputes_pkey" PRIMARY KEY (dispute_id);
alter table public."project_disputes" add constraint "project_disputes_resolution_action_check" CHECK (((resolution_action IS NULL) OR (resolution_action = ANY (ARRAY['resume_work'::text, 'cancel_project'::text]))));
alter table public."project_disputes" add constraint "project_disputes_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'under_review'::text, 'resolved'::text])));
alter table public."project_submissions" add constraint "project_submissions_body_length_check" CHECK ((length(body) <= 10000));
alter table public."project_submissions" add constraint "project_submissions_content_check" CHECK ((((length(btrim(body)) > 0) AND (length(body) <= 10000)) OR (link IS NOT NULL) OR ((attachment_path IS NOT NULL) AND (attachment_name IS NOT NULL))));
alter table public."project_submissions" add constraint "project_submissions_kind_check" CHECK ((kind = ANY (ARRAY['progress'::text, 'delivery'::text])));
alter table public."project_submissions" add constraint "project_submissions_link_check" CHECK (((link IS NULL) OR (link ~* '^https?://'::text)));
alter table public."project_submissions" add constraint "project_submissions_pkey" PRIMARY KEY (submission_id);
alter table public."project_submissions" add constraint "project_submissions_status_check" CHECK ((status = ANY (ARRAY['submitted'::text, 'revision_requested'::text, 'approved'::text])));
alter table public."projects" add constraint "projects_at_most_one_source_check" CHECK ((NOT ((order_id IS NOT NULL) AND (application_id IS NOT NULL))));
alter table public."projects" add constraint "projects_order_or_application_check" CHECK ((NOT ((order_id IS NOT NULL) AND (application_id IS NOT NULL))));
alter table public."projects" add constraint "projects_pkey" PRIMARY KEY (project_id);
alter table public."service_orders" add constraint "service_order_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text, 'converted'::text])));
alter table public."service_orders" add constraint "service_orders_pkey" PRIMARY KEY (order_id);
alter table public."service_orders" add constraint "service_orders_source_shape_check" CHECK ((((service_id IS NOT NULL) AND (job_id IS NULL) AND (application_id IS NULL)) OR ((service_id IS NULL) AND (job_id IS NOT NULL) AND (application_id IS NOT NULL))));
create function public.worksync_is_admin() returns boolean language sql as $$ select false $$;
create function public.worksync_contract_party(uuid) returns text language sql as $$ select null::text $$;
create function public.worksync_project_party(uuid) returns text language sql as $$ select null::text $$;
