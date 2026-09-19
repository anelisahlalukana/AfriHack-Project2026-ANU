-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  advisor_id uuid,
  first_name text NOT NULL,
  second_name text,
  surname text NOT NULL,
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
  CONSTRAINT clients_pkey PRIMARY KEY (id),
  CONSTRAINT clients_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES auth.users(id)
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
  CONSTRAINT client_dependants_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
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
  CONSTRAINT client_financial_items_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
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
  CONSTRAINT client_goals_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
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
  CONSTRAINT documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  task_type text NOT NULL,
  title text,
  current_stage text,
  status text DEFAULT 'open'::text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  provider_id uuid,
  claim_category text CHECK (claim_category IS NULL OR (claim_category = ANY (ARRAY['motor'::text, 'life'::text, 'health'::text, 'funeral'::text, 'personal'::text, 'commercial'::text]))),
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT tasks_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id)
);
CREATE TABLE public.task_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid,
  stage text,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
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
  CONSTRAINT task_files_pkey PRIMARY KEY (id),
  CONSTRAINT task_files_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id)
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
  CONSTRAINT reminders_pkey PRIMARY KEY (id),
  CONSTRAINT reminders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
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
  CONSTRAINT notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
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
  CONSTRAINT goal_participants_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.claim_stages (
  step_order integer NOT NULL,
  stage_key text NOT NULL,
  stage_label text NOT NULL,
  category text NOT NULL DEFAULT 'motor'::text CHECK (category = ANY (ARRAY['motor'::text, 'other'::text])),
  CONSTRAINT claim_stages_pkey PRIMARY KEY (category, step_order)
);
CREATE TABLE public.providers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider_type text NOT NULL,
  integration_mode text DEFAULT 'mock'::text,
  mock_endpoint text,
  created_at timestamp with time zone DEFAULT now(),
  claim_category text CHECK (claim_category IS NULL OR (claim_category = ANY (ARRAY['motor'::text, 'life'::text, 'health'::text, 'funeral'::text, 'personal'::text, 'commercial'::text]))),
  CONSTRAINT providers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.provider_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid,
  provider_id uuid,
  direction text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT provider_events_pkey PRIMARY KEY (id),
  CONSTRAINT provider_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT provider_events_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id)
);