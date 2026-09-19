-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

-- One table for all user types (client, provider, advisor). See migration 202609190003.
-- Provider-only columns: organisation_name, provider_type, integration_mode, mock_endpoint, claim_category, product_lines, reference_prefix.
CREATE TABLE public.roles (
  id smallint NOT NULL,
  name text NOT NULL UNIQUE CHECK (name = lower(name)),
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);
-- Seeded: 1 = client, 2 = provider, 3 = advisor
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role_id smallint NOT NULL DEFAULT 1,
  auth_user_id uuid UNIQUE,
  advisor_id uuid,
  first_name text,
  second_name text,
  surname text,
  organisation_name text,
  provider_type text,
  integration_mode text,
  mock_endpoint text,
  product_lines text[],
  reference_prefix text,
  claim_category text CHECK (claim_category IS NULL OR (claim_category = ANY (ARRAY['motor'::text, 'life'::text, 'health'::text, 'funeral'::text, 'personal'::text, 'commercial'::text]))),
  id_number text,
  date_of_birth date,
  nationality text,
  marital_status text,
  occupation text,
  employer_name text,
  annual_income numeric,
  is_politically_exposed boolean DEFAULT false,
  pep_details text,
  risk_profile_score integer,
  risk_profile_category text,
  contact_email text,
  contact_mobile text,
  physical_address text,
  status text DEFAULT 'onboarding'::text,
  created_at timestamp with time zone DEFAULT now(),
  bank_name text,
  bank_account_number text,
  bank_account_type text,
  debit_order_day integer,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id),
  CONSTRAINT users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id),
  CONSTRAINT users_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES auth.users(id),
  CONSTRAINT users_identity_required CHECK (CASE role_id WHEN 2 THEN organisation_name IS NOT NULL ELSE first_name IS NOT NULL END)
);
CREATE TABLE public.client_dependants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  full_name text NOT NULL,
  relationship text,
  date_of_birth date,
  id_number text,
  beneficiary_percentage numeric,
  CONSTRAINT client_dependants_pkey PRIMARY KEY (id),
  CONSTRAINT client_dependants_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id)
);
CREATE TABLE public.client_financial_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  category text NOT NULL,
  item_type text NOT NULL,
  description text,
  amount numeric NOT NULL,
  frequency text,
  interest_rate numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT client_financial_items_pkey PRIMARY KEY (id),
  CONSTRAINT client_financial_items_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id)
);
CREATE TABLE public.client_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  goal_name text NOT NULL,
  goal_type text,
  target_amount numeric,
  target_date date,
  current_progress numeric DEFAULT 0,
  status text DEFAULT 'in_progress'::text,
  is_shared boolean DEFAULT false,
  CONSTRAINT client_goals_pkey PRIMARY KEY (id),
  CONSTRAINT client_goals_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id)
);
CREATE TABLE public.documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  document_type text NOT NULL,
  status text DEFAULT 'not_sent'::text,
  template_file_url text,
  filled_file_url text,
  signed_file_url text,
  signature_data text,
  sent_at timestamp with time zone,
  signed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  CONSTRAINT documents_pkey PRIMARY KEY (id),
  CONSTRAINT documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id)
);
CREATE TABLE public.adviser_compliance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  adviser_id uuid NOT NULL,
  qualification_status text DEFAULT 'pending'::text,
  cpd_status text DEFAULT 'not_started'::text,
  is_politically_exposed boolean DEFAULT false,
  pep_details text,
  terrorism_financing_flag boolean DEFAULT false,
  terrorism_financing_details text,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT adviser_compliance_pkey PRIMARY KEY (id),
  CONSTRAINT adviser_compliance_adviser_id_key UNIQUE (adviser_id),
  CONSTRAINT adviser_compliance_adviser_id_fkey FOREIGN KEY (adviser_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  task_type text NOT NULL,
  title text,
  current_stage text,
  status text DEFAULT 'open'::text CHECK (status = ANY (ARRAY['draft'::text, 'open'::text, 'awaiting_client'::text, 'completed'::text, 'declined'::text, 'cancelled'::text])),
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  provider_id uuid,
  claim_category text CHECK (claim_category IS NULL OR (claim_category = ANY (ARRAY['motor'::text, 'life'::text, 'health'::text, 'funeral'::text, 'personal'::text, 'commercial'::text]))),
  reference text UNIQUE DEFAULT ('RSF-'::text || (nextval('task_reference_seq'::regclass))::text),
  workflow text CHECK (workflow IS NULL OR (workflow = ANY (ARRAY['motor'::text, 'life'::text, 'health'::text, 'funeral'::text, 'personal'::text, 'commercial'::text, 'request'::text, 'internal_request'::text]))),
  policy_number text,
  created_by uuid,
  submitted_at timestamp with time zone,
  closed_at timestamp with time zone,
  client_rating integer CHECK (client_rating IS NULL OR client_rating >= 1 AND client_rating <= 5),
  client_review text,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id),
  CONSTRAINT tasks_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.users(id),
  CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.task_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid,
  stage text,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  actor_type text NOT NULL DEFAULT 'adviser'::text CHECK (actor_type = ANY (ARRAY['client'::text, 'adviser'::text, 'provider'::text, 'system'::text])),
  actor_label text,
  update_kind text NOT NULL DEFAULT 'stage_change'::text CHECK (update_kind = ANY (ARRAY['stage_change'::text, 'message'::text, 'file'::text, 'client_action'::text, 'provider_event'::text])),
  visible_to_client boolean NOT NULL DEFAULT true,
  CONSTRAINT task_updates_pkey PRIMARY KEY (id),
  CONSTRAINT task_updates_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT task_updates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.task_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid,
  file_url text NOT NULL,
  file_type text,
  uploaded_at timestamp with time zone DEFAULT now(),
  label text,
  document_key text,
  content_type text,
  size_bytes integer,
  uploaded_by uuid,
  actor_type text NOT NULL DEFAULT 'client'::text,
  CONSTRAINT task_files_pkey PRIMARY KEY (id),
  CONSTRAINT task_files_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT task_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  title text NOT NULL,
  reminder_type text,
  trigger_date date NOT NULL,
  recurrence text,
  recipient text,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  task_id uuid,
  remind_at timestamp with time zone,
  CONSTRAINT reminders_pkey PRIMARY KEY (id),
  CONSTRAINT reminders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id),
  CONSTRAINT reminders_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  title text NOT NULL,
  body text,
  is_read boolean DEFAULT false,
  related_task_id uuid,
  related_reminder_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  recipient text DEFAULT 'client'::text,
  advisor_id uuid,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id),
  CONSTRAINT notifications_related_task_id_fkey FOREIGN KEY (related_task_id) REFERENCES public.tasks(id),
  CONSTRAINT notifications_related_reminder_id_fkey FOREIGN KEY (related_reminder_id) REFERENCES public.reminders(id),
  CONSTRAINT notifications_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES auth.users(id)
);
CREATE TABLE public.goal_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  goal_id uuid,
  client_id uuid,
  CONSTRAINT goal_participants_pkey PRIMARY KEY (id),
  CONSTRAINT goal_participants_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.client_goals(id),
  CONSTRAINT goal_participants_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id)
);
CREATE TABLE public.claim_stages (
  step_order integer NOT NULL,
  stage_key text NOT NULL,
  stage_label text NOT NULL,
  category text NOT NULL DEFAULT 'motor'::text CHECK (category = ANY (ARRAY['motor'::text, 'life'::text, 'health'::text, 'funeral'::text, 'personal'::text, 'commercial'::text, 'request'::text, 'internal_request'::text, 'other'::text])),
  actor text NOT NULL DEFAULT 'adviser'::text CHECK (actor = ANY (ARRAY['client'::text, 'adviser'::text, 'provider'::text])),
  requires_client_action boolean NOT NULL DEFAULT false,
  client_action_kind text CHECK (client_action_kind IS NULL OR (client_action_kind = ANY (ARRAY['confirm'::text, 'date'::text, 'upload'::text, 'review'::text]))),
  client_action_label text,
  repeatable boolean NOT NULL DEFAULT false,
  is_terminal boolean NOT NULL DEFAULT false,
  outcome text CHECK (outcome IS NULL OR (outcome = ANY (ARRAY['completed'::text, 'declined'::text]))),
  CONSTRAINT claim_stages_pkey PRIMARY KEY (category, step_order),
  CONSTRAINT claim_stages_category_stage_key_idx UNIQUE (category, stage_key)
);
CREATE TABLE public.provider_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid,
  provider_id uuid,
  direction text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  event_type text,
  CONSTRAINT provider_events_pkey PRIMARY KEY (id),
  CONSTRAINT provider_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT provider_events_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.users(id)
);
CREATE TABLE public.claim_categories (
  category text NOT NULL CHECK (category = ANY (ARRAY['motor'::text, 'life'::text, 'health'::text, 'funeral'::text, 'personal'::text, 'commercial'::text])),
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  safety_banner boolean NOT NULL DEFAULT false,
  police_report_hours integer,
  scene_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT claim_categories_pkey PRIMARY KEY (category)
);
CREATE TABLE public.request_types (
  task_type text NOT NULL,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  workflow text NOT NULL DEFAULT 'request'::text CHECK (workflow = ANY (ARRAY['request'::text, 'internal_request'::text])),
  requires_provider boolean NOT NULL DEFAULT true,
  apply_action text CHECK (apply_action IS NULL OR (apply_action = ANY (ARRAY['update_address'::text, 'update_bank_details'::text, 'update_debit_order_day'::text, 'add_financial_items'::text]))),
  form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT request_types_pkey PRIMARY KEY (task_type)
);
