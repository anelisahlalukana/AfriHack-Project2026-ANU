-- Claims & client requests engine (feature/claims_flow).
-- Apply after 202609190001 and 202609190002, on a project that already has the
-- tables described in docs/schema.md (tasks, task_updates, task_files,
-- claim_stages, providers, provider_events, reminders, notifications).
-- Safe to re-run: every statement is guarded (IF NOT EXISTS / ON CONFLICT).
--
-- Design: one task engine for every claim category AND every non-claim request.
-- What each claim category or request type needs (checklist, form fields,
-- documents, stages) is configuration in the tables below, so adding a category
-- or changing what "Life" requires is a data change, not a code change.
-- Only the motor workflow comes from the Royal Square brief; the other
-- categories are seeded with typical South African claim requirements and
-- should be confirmed with Royal Square.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Link a client Auth login to an adviser-managed client record, so a client
--    can see and act on their own claims and requests.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id);
CREATE UNIQUE INDEX IF NOT EXISTS clients_auth_user_id_key ON public.clients(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Workflow stages: every claim category plus the two request workflows.
-- ---------------------------------------------------------------------------
ALTER TABLE public.claim_stages ADD COLUMN IF NOT EXISTS actor text NOT NULL DEFAULT 'adviser';
ALTER TABLE public.claim_stages ADD COLUMN IF NOT EXISTS requires_client_action boolean NOT NULL DEFAULT false;
ALTER TABLE public.claim_stages ADD COLUMN IF NOT EXISTS client_action_kind text;
ALTER TABLE public.claim_stages ADD COLUMN IF NOT EXISTS client_action_label text;
ALTER TABLE public.claim_stages ADD COLUMN IF NOT EXISTS repeatable boolean NOT NULL DEFAULT false;
ALTER TABLE public.claim_stages ADD COLUMN IF NOT EXISTS is_terminal boolean NOT NULL DEFAULT false;
ALTER TABLE public.claim_stages ADD COLUMN IF NOT EXISTS outcome text;

ALTER TABLE public.claim_stages DROP CONSTRAINT IF EXISTS claim_stages_category_check;
ALTER TABLE public.claim_stages ADD CONSTRAINT claim_stages_category_check CHECK (category IN
  ('motor', 'life', 'health', 'funeral', 'personal', 'commercial', 'request', 'internal_request', 'other'));
ALTER TABLE public.claim_stages DROP CONSTRAINT IF EXISTS claim_stages_actor_check;
ALTER TABLE public.claim_stages ADD CONSTRAINT claim_stages_actor_check CHECK (actor IN ('client', 'adviser', 'provider'));
ALTER TABLE public.claim_stages DROP CONSTRAINT IF EXISTS claim_stages_client_action_kind_check;
ALTER TABLE public.claim_stages ADD CONSTRAINT claim_stages_client_action_kind_check
  CHECK (client_action_kind IS NULL OR client_action_kind IN ('confirm', 'date', 'upload', 'review'));
ALTER TABLE public.claim_stages DROP CONSTRAINT IF EXISTS claim_stages_outcome_check;
ALTER TABLE public.claim_stages ADD CONSTRAINT claim_stages_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('completed', 'declined'));
-- stage_key must be unique per workflow, not globally (motor and life both end in 'closed').
ALTER TABLE public.claim_stages DROP CONSTRAINT IF EXISTS motor_claim_stages_stage_key_key;
ALTER TABLE public.claim_stages DROP CONSTRAINT IF EXISTS claim_stages_stage_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS claim_stages_category_stage_key_idx ON public.claim_stages(category, stage_key);

-- The earlier generic 'other' fallback is replaced by a real stage list per category.
DELETE FROM public.claim_stages WHERE category = 'other';
-- Reseed each workflow cleanly so re-running the migration never leaves stale steps.
DELETE FROM public.claim_stages WHERE category IN
  ('motor', 'life', 'health', 'funeral', 'personal', 'commercial', 'request', 'internal_request');

INSERT INTO public.claim_stages
  (category, step_order, stage_key, stage_label, actor, requires_client_action, client_action_kind, client_action_label, repeatable, is_terminal, outcome)
VALUES
  -- Motor: the ten steps from the brief, in order.
  ('motor', 1,  'claim_registered',     'Insurer returns a claim number and a claims handler', 'provider', false, NULL, NULL, false, false, NULL),
  ('motor', 2,  'vehicle_assessment',   'Client takes the vehicle for assessment',             'client',   true,  'confirm', 'Confirm you have taken the vehicle for assessment', false, false, NULL),
  ('motor', 3,  'assessment_submitted', 'Assessment goes to the insurer and to us',            'provider', false, NULL, NULL, false, false, NULL),
  ('motor', 4,  'repair_quotes',        'Repair quotes go to the insurer',                     'adviser',  false, NULL, NULL, false, false, NULL),
  ('motor', 5,  'repairs_authorised',   'Insurer authorises repairs',                          'provider', false, NULL, NULL, false, false, NULL),
  ('motor', 6,  'dropoff_scheduled',    'Client picks a date for the vehicle to go in',        'client',   true,  'date', 'Pick a date for your vehicle to go in for repairs', false, false, NULL),
  ('motor', 7,  'car_hire_arranged',    'We arrange car hire and delivery to the repairer',    'adviser',  false, NULL, NULL, false, false, NULL),
  ('motor', 8,  'repair_in_progress',   'Weekly repair updates pushed to us',                  'provider', false, NULL, NULL, true,  false, NULL),
  ('motor', 9,  'hire_car_returned',    'We arrange collection and return of the hire car',    'adviser',  false, NULL, NULL, false, false, NULL),
  ('motor', 10, 'closed',               'Client writes a short review and closes the transaction', 'client', true, 'review', 'Leave a short review to close your claim', false, true, 'completed'),
  ('motor', 100,'declined',             'Claim declined by the insurer',                       'provider', false, NULL, NULL, false, true, 'declined'),
  -- Life (assumed, confirm with Royal Square).
  ('life', 1,   'claim_registered',     'Insurer returns a claim number and a claims handler', 'provider', false, NULL, NULL, false, false, NULL),
  ('life', 2,   'claim_documents',      'Beneficiaries send the claim documents',              'client',   true,  'upload', 'Upload the death certificate, beneficiary IDs and bank confirmation', false, false, NULL),
  ('life', 3,   'documents_verified',   'We check the documents and send them to the insurer', 'adviser',  false, NULL, NULL, false, false, NULL),
  ('life', 4,   'under_assessment',     'Insurer assesses the claim',                          'provider', false, NULL, NULL, false, false, NULL),
  ('life', 5,   'approved',             'Insurer approves the claim',                          'provider', false, NULL, NULL, false, false, NULL),
  ('life', 6,   'benefit_paid',         'Benefit paid to the beneficiaries',                   'provider', false, NULL, NULL, false, false, NULL),
  ('life', 7,   'closed',               'Client confirms payment and closes the claim',        'client',   true,  'review', 'Confirm you received the payment and leave a short review', false, true, 'completed'),
  ('life', 100, 'declined',             'Claim declined by the insurer',                       'provider', false, NULL, NULL, false, true, 'declined'),
  -- Health (assumed).
  ('health', 1,   'claim_registered',   'Insurer returns a claim number and a claims handler', 'provider', false, NULL, NULL, false, false, NULL),
  ('health', 2,   'supporting_documents','Client sends invoices and the doctor''s report',     'client',   true,  'upload', 'Upload your medical invoices and the doctor''s report', false, false, NULL),
  ('health', 3,   'under_assessment',   'Medical scheme or insurer assesses the claim',        'provider', false, NULL, NULL, false, false, NULL),
  ('health', 4,   'approved',           'Claim approved',                                      'provider', false, NULL, NULL, false, false, NULL),
  ('health', 5,   'paid',               'Claim paid to the client or provider',                'provider', false, NULL, NULL, false, false, NULL),
  ('health', 6,   'closed',             'Client confirms payment and closes the claim',        'client',   true,  'review', 'Confirm the claim was paid and leave a short review', false, true, 'completed'),
  ('health', 100, 'declined',           'Claim declined',                                      'provider', false, NULL, NULL, false, true, 'declined'),
  -- Funeral (assumed; usually paid within 48 hours).
  ('funeral', 1,   'claim_registered',  'Insurer returns a claim number and a claims handler', 'provider', false, NULL, NULL, false, false, NULL),
  ('funeral', 2,   'documents_verified','We verify the death certificate and IDs',             'adviser',  false, NULL, NULL, false, false, NULL),
  ('funeral', 3,   'benefit_paid',      'Funeral benefit paid',                                'provider', false, NULL, NULL, false, false, NULL),
  ('funeral', 4,   'closed',            'Family confirms payment and closes the claim',        'client',   true,  'review', 'Confirm you received the payment and leave a short review', false, true, 'completed'),
  ('funeral', 100, 'declined',          'Claim declined',                                      'provider', false, NULL, NULL, false, true, 'declined'),
  -- Personal lines: household contents, buildings, possessions (assumed).
  ('personal', 1,   'claim_registered', 'Insurer returns a claim number and a claims handler', 'provider', false, NULL, NULL, false, false, NULL),
  ('personal', 2,   'assessor_visit',   'Client books the assessor visit',                     'client',   true,  'date', 'Pick a date for the assessor to visit', false, false, NULL),
  ('personal', 3,   'assessment',       'Assessor reports to the insurer and to us',           'provider', false, NULL, NULL, false, false, NULL),
  ('personal', 4,   'quotes_submitted', 'Client sends repair or replacement quotes',           'client',   true,  'upload', 'Upload your repair or replacement quotes', false, false, NULL),
  ('personal', 5,   'authorised',       'Insurer authorises the settlement',                   'provider', false, NULL, NULL, false, false, NULL),
  ('personal', 6,   'settled',          'Claim settled',                                       'provider', false, NULL, NULL, false, false, NULL),
  ('personal', 7,   'closed',           'Client writes a short review and closes the claim',   'client',   true,  'review', 'Leave a short review to close your claim', false, true, 'completed'),
  ('personal', 100, 'declined',         'Claim declined by the insurer',                       'provider', false, NULL, NULL, false, true, 'declined'),
  -- Commercial (assumed).
  ('commercial', 1,   'claim_registered',        'Insurer returns a claim number and a claims handler', 'provider', false, NULL, NULL, false, false, NULL),
  ('commercial', 2,   'loss_adjuster_appointed', 'Insurer appoints a loss adjuster',                   'provider', false, NULL, NULL, false, false, NULL),
  ('commercial', 3,   'loss_statement',          'Business sends the loss statement and records',      'client',   true,  'upload', 'Upload your loss statement and supporting records', false, false, NULL),
  ('commercial', 4,   'assessed',                'Loss adjuster reports to the insurer and to us',     'provider', false, NULL, NULL, false, false, NULL),
  ('commercial', 5,   'authorised',              'Insurer authorises the settlement',                  'provider', false, NULL, NULL, false, false, NULL),
  ('commercial', 6,   'settled',                 'Claim settled',                                      'provider', false, NULL, NULL, false, false, NULL),
  ('commercial', 7,   'closed',                  'Client writes a short review and closes the claim',  'client',   true,  'review', 'Leave a short review to close your claim', false, true, 'completed'),
  ('commercial', 100, 'declined',                'Claim declined by the insurer',                      'provider', false, NULL, NULL, false, true, 'declined'),
  -- Requests that pass through to a product provider (bank details, beneficiary, IRP5, ...).
  ('request', 1,   'submitted',         'Request received by Royal Square',                    'client',   false, NULL, NULL, false, false, NULL),
  ('request', 2,   'with_provider',     'Sent to the product provider',                        'provider', false, NULL, NULL, false, false, NULL),
  ('request', 3,   'confirmed',         'Provider confirms the change',                        'provider', false, NULL, NULL, false, false, NULL),
  ('request', 4,   'closed',            'Done, and everyone is informed',                      'adviser',  false, NULL, NULL, false, true, 'completed'),
  ('request', 100, 'declined',          'Provider could not complete the request',             'provider', false, NULL, NULL, false, true, 'declined'),
  -- Requests handled inside Royal Square (consultation, balance sheet).
  ('internal_request', 1,   'submitted',   'Request received by Royal Square',                 'client',   false, NULL, NULL, false, false, NULL),
  ('internal_request', 2,   'in_progress', 'Your adviser is working on it',                    'adviser',  false, NULL, NULL, false, false, NULL),
  ('internal_request', 3,   'closed',      'Done, and everyone is informed',                   'adviser',  false, NULL, NULL, false, true, 'completed'),
  ('internal_request', 100, 'declined',    'Request could not be completed',                   'adviser',  false, NULL, NULL, false, true, 'declined');

-- ---------------------------------------------------------------------------
-- 3. Claim categories: what the client sees and must provide, per category.
--    checklist items: {key,label,hint,kind,document_key?}  kind = photo | text | voice | toggle
--                     document_key files a capture under that required document
--    form fields:     {key,label,type,required,options?,hint?}
--                     type = text | textarea | date | datetime | number | select | boolean | tel
--    documents:       {key,label,required}
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.claim_categories (
  category text PRIMARY KEY,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  safety_banner boolean NOT NULL DEFAULT false,
  police_report_hours integer,
  scene_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT claim_categories_category_check CHECK (category IN ('motor', 'life', 'health', 'funeral', 'personal', 'commercial'))
);

INSERT INTO public.claim_categories (category, label, description, sort_order, safety_banner, police_report_hours, scene_checklist, form_fields, required_documents) VALUES
('motor', 'Motor', 'An accident, theft or damage involving your vehicle.', 1, true, 48,
 '[{"key":"location","label":"Where you are","hint":"Address or nearest cross streets","kind":"text"},
   {"key":"road_photos","label":"Road surface and direction of travel","hint":"Photos from both directions","kind":"photo","document_key":"damage_photos"},
   {"key":"vehicle_photos","label":"All vehicles and people involved","hint":"Photos of every vehicle and the damage","kind":"photo","document_key":"damage_photos"},
   {"key":"plates","label":"Licence plates and registration discs","hint":"Every vehicle involved","kind":"photo","document_key":"registration_discs"},
   {"key":"ids","label":"ID documents of everyone involved","hint":"Photo of each ID","kind":"photo"},
   {"key":"witnesses","label":"Witnesses","hint":"Names, numbers and a voice note if possible","kind":"voice","document_key":"witness_voice_note"},
   {"key":"other_insurance","label":"Other party''s insurance","hint":"Insurer and policy number","kind":"text"},
   {"key":"police_reminder","label":"Report to the police within 48 hours","hint":"We will remind you","kind":"toggle"}]'::jsonb,
 '[{"key":"incident_at","label":"Date and time of the incident","type":"datetime","required":true},
   {"key":"description","label":"What happened","type":"textarea","required":true},
   {"key":"police_notified","label":"Police notified","type":"boolean","required":false},
   {"key":"police_case_number","label":"Police case number","type":"text","required":false},
   {"key":"witness_details","label":"Witness details","type":"textarea","required":false},
   {"key":"witness_statement_taken","label":"Witness statement taken","type":"boolean","required":false},
   {"key":"driver_name","label":"Who was driving","type":"text","required":true},
   {"key":"vehicle_use","label":"Vehicle use at the time","type":"select","required":true,"options":["Personal","Business"]},
   {"key":"other_vehicles","label":"Other vehicles or property involved","type":"textarea","required":false},
   {"key":"third_party_licence","label":"Third party driver''s licence number","type":"text","required":false},
   {"key":"third_party_registration","label":"Third party vehicle registration","type":"text","required":false},
   {"key":"third_party_insurer","label":"Third party insurer","type":"text","required":false},
   {"key":"third_party_policy","label":"Third party policy number","type":"text","required":false}]'::jsonb,
 '[{"key":"damage_photos","label":"Photos of all vehicles, damage and road surface","required":true},
   {"key":"registration_discs","label":"Registration discs and licences","required":true},
   {"key":"drivers_licence","label":"Your driver''s licence","required":true},
   {"key":"accident_sketch","label":"Sketch of the accident","required":false},
   {"key":"witness_voice_note","label":"Witness voice note","required":false}]'::jsonb),
('life', 'Life', 'A claim after the death of a policyholder.', 2, false, NULL, '[]'::jsonb,
 '[{"key":"deceased_name","label":"Full name of the deceased","type":"text","required":true},
   {"key":"date_of_death","label":"Date of death","type":"date","required":true},
   {"key":"cause_of_death","label":"Cause of death","type":"select","required":true,"options":["Natural","Unnatural","Unknown"]},
   {"key":"claimant_relationship","label":"Your relationship to the deceased","type":"text","required":true},
   {"key":"description","label":"Anything else we should know","type":"textarea","required":false}]'::jsonb,
 '[{"key":"death_certificate","label":"Death certificate","required":true},
   {"key":"deceased_id","label":"ID of the deceased","required":true},
   {"key":"beneficiary_ids","label":"Beneficiary IDs","required":true},
   {"key":"bank_confirmation","label":"Beneficiary bank confirmation letter","required":true}]'::jsonb),
('health', 'Health', 'Medical expenses, hospital stays or gap cover.', 3, false, NULL, '[]'::jsonb,
 '[{"key":"treatment_date","label":"Date of treatment","type":"date","required":true},
   {"key":"patient_name","label":"Patient name","type":"text","required":true},
   {"key":"membership_number","label":"Membership or policy number","type":"text","required":false},
   {"key":"treating_doctor","label":"Treating doctor or hospital","type":"text","required":true},
   {"key":"amount_claimed","label":"Amount claimed (ZAR)","type":"number","required":true},
   {"key":"description","label":"Treatment details","type":"textarea","required":true}]'::jsonb,
 '[{"key":"invoices","label":"Medical invoices","required":true},
   {"key":"doctor_report","label":"Doctor''s report","required":false}]'::jsonb),
('funeral', 'Funeral', 'Funeral cover after the death of a covered family member.', 4, false, NULL, '[]'::jsonb,
 '[{"key":"deceased_name","label":"Full name of the deceased","type":"text","required":true},
   {"key":"date_of_death","label":"Date of death","type":"date","required":true},
   {"key":"relationship","label":"Relationship to the policyholder","type":"text","required":true},
   {"key":"funeral_date","label":"Date of the funeral","type":"date","required":false},
   {"key":"funeral_parlour","label":"Funeral parlour","type":"text","required":false}]'::jsonb,
 '[{"key":"death_certificate","label":"Death certificate","required":true},
   {"key":"deceased_id","label":"ID of the deceased","required":true},
   {"key":"claimant_id","label":"Your ID","required":true},
   {"key":"funeral_invoice","label":"Funeral parlour invoice","required":false}]'::jsonb),
('personal', 'Home and possessions', 'Household contents, buildings or portable possessions.', 5, false, NULL, '[]'::jsonb,
 '[{"key":"incident_at","label":"Date and time of the loss","type":"datetime","required":true},
   {"key":"loss_type","label":"Type of loss","type":"select","required":true,"options":["Theft or burglary","Fire","Storm or water damage","Accidental damage","Other"]},
   {"key":"police_case_number","label":"Police case number (for theft)","type":"text","required":false},
   {"key":"items","label":"Items lost or damaged","type":"textarea","required":true},
   {"key":"estimated_value","label":"Estimated value (ZAR)","type":"number","required":false}]'::jsonb,
 '[{"key":"damage_photos","label":"Photos of the damage","required":false},
   {"key":"proof_of_ownership","label":"Proof of ownership (receipts, photos, valuations)","required":true},
   {"key":"quotes","label":"Repair or replacement quotes","required":false}]'::jsonb),
('commercial', 'Commercial', 'Business property, liability or business interruption.', 6, false, NULL, '[]'::jsonb,
 '[{"key":"business_name","label":"Business name","type":"text","required":true},
   {"key":"incident_at","label":"Date and time of the loss","type":"datetime","required":true},
   {"key":"loss_type","label":"Type of loss","type":"select","required":true,"options":["Property damage","Theft","Liability","Business interruption","Other"]},
   {"key":"description","label":"What happened","type":"textarea","required":true},
   {"key":"estimated_value","label":"Estimated loss (ZAR)","type":"number","required":false}]'::jsonb,
 '[{"key":"loss_statement","label":"Loss statement","required":true},
   {"key":"supporting_records","label":"Supporting records (invoices, stock sheets)","required":false},
   {"key":"damage_photos","label":"Photos of the damage","required":false}]'::jsonb)
ON CONFLICT (category) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
  safety_banner = EXCLUDED.safety_banner, police_report_hours = EXCLUDED.police_report_hours,
  scene_checklist = EXCLUDED.scene_checklist, form_fields = EXCLUDED.form_fields,
  required_documents = EXCLUDED.required_documents;

-- ---------------------------------------------------------------------------
-- 4. Request types (non-claim). workflow = which stage list the request uses.
--    apply_action = what changes on the client record when the request closes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.request_types (
  task_type text PRIMARY KEY,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  workflow text NOT NULL DEFAULT 'request',
  requires_provider boolean NOT NULL DEFAULT true,
  apply_action text,
  form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT request_types_workflow_check CHECK (workflow IN ('request', 'internal_request')),
  CONSTRAINT request_types_apply_action_check CHECK (apply_action IS NULL OR apply_action IN
    ('update_address', 'update_bank_details', 'update_debit_order_day', 'add_financial_items'))
);

INSERT INTO public.request_types (task_type, label, description, sort_order, workflow, requires_provider, apply_action, form_fields, required_documents) VALUES
('address_change', 'Change of address', 'Update your address with us and your providers.', 1, 'request', true, 'update_address',
 '[{"key":"new_address","label":"New physical address","type":"textarea","required":true},
   {"key":"effective_date","label":"Effective from","type":"date","required":false}]'::jsonb,
 '[{"key":"proof_of_address","label":"Proof of address (not older than 3 months)","required":true}]'::jsonb),
('banking_change', 'Change of bank details', 'Change the account your premiums or payouts use.', 2, 'request', true, 'update_bank_details',
 '[{"key":"bank_name","label":"Bank","type":"text","required":true},
   {"key":"bank_account_number","label":"Account number","type":"text","required":true},
   {"key":"bank_account_type","label":"Account type","type":"select","required":true,"options":["Cheque","Savings","Transmission"]}]'::jsonb,
 '[{"key":"bank_confirmation","label":"Bank confirmation letter or statement","required":true}]'::jsonb),
('debit_order_change', 'Change debit order date', 'Move the day your premium goes off.', 3, 'request', true, 'update_debit_order_day',
 '[{"key":"debit_order_day","label":"New debit order day (1 to 31)","type":"number","required":true}]'::jsonb,
 '[]'::jsonb),
('beneficiary_change', 'Add or change a beneficiary', 'Update who benefits from a policy.', 4, 'request', true, NULL,
 '[{"key":"beneficiary_name","label":"Beneficiary full name","type":"text","required":true},
   {"key":"beneficiary_id_number","label":"Beneficiary ID number","type":"text","required":true},
   {"key":"relationship","label":"Relationship to you","type":"text","required":true},
   {"key":"percentage","label":"Share of the benefit (%)","type":"number","required":true},
   {"key":"change_type","label":"Change","type":"select","required":true,"options":["Add","Change","Remove"]}]'::jsonb,
 '[{"key":"beneficiary_id","label":"Beneficiary ID document","required":false}]'::jsonb),
('document_request', 'Request a policy document', 'Policy schedule, contract or statement.', 5, 'request', true, NULL,
 '[{"key":"document_needed","label":"Document you need","type":"select","required":true,"options":["Policy schedule","Policy contract","Statement","Tax certificate","Other"]},
   {"key":"notes","label":"Anything specific","type":"textarea","required":false}]'::jsonb,
 '[]'::jsonb),
('border_letter', 'Request a border letter', 'Letter to take a financed vehicle across the border.', 6, 'request', true, NULL,
 '[{"key":"vehicle","label":"Vehicle (make, model, registration)","type":"text","required":true},
   {"key":"destination","label":"Destination country","type":"text","required":true},
   {"key":"travel_from","label":"Travel from","type":"date","required":true},
   {"key":"travel_to","label":"Travel to","type":"date","required":true}]'::jsonb,
 '[]'::jsonb),
('irp5_request', 'Request an IRP5 or tax certificate', 'Tax certificate from an investment company.', 7, 'request', true, NULL,
 '[{"key":"tax_year","label":"Tax year","type":"text","required":true,"hint":"For example 2026"}]'::jsonb,
 '[]'::jsonb),
('consultation_request', 'Request a consultation', 'Book time with your adviser.', 8, 'internal_request', false, NULL,
 '[{"key":"preferred_date","label":"Preferred date","type":"date","required":true},
   {"key":"format","label":"Meeting format","type":"select","required":true,"options":["In person","Video call","Phone call"]},
   {"key":"topic","label":"What would you like to discuss","type":"textarea","required":true}]'::jsonb,
 '[]'::jsonb),
('client_info_update', 'Send balance sheet or income statement', 'Update your assets, liabilities, income or expenses.', 9, 'internal_request', false, 'add_financial_items',
 '[{"key":"items","label":"Items","type":"financial_items","required":true,"hint":"One row per asset, liability, income or expense"},
   {"key":"notes","label":"Notes for your adviser","type":"textarea","required":false}]'::jsonb,
 '[{"key":"supporting_statements","label":"Supporting statements","required":false}]'::jsonb)
ON CONFLICT (task_type) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
  workflow = EXCLUDED.workflow, requires_provider = EXCLUDED.requires_provider, apply_action = EXCLUDED.apply_action,
  form_fields = EXCLUDED.form_fields, required_documents = EXCLUDED.required_documents;

-- ---------------------------------------------------------------------------
-- 5. Tasks: one row per claim or request.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.task_reference_seq START 1001;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reference text DEFAULT ('RSF-' || nextval('public.task_reference_seq')::text);
CREATE UNIQUE INDEX IF NOT EXISTS tasks_reference_key ON public.tasks(reference);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS workflow text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS policy_number text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_rating integer;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_review text;

-- Existing motor-only rows from earlier patches.
UPDATE public.tasks SET claim_category = 'motor' WHERE task_type = 'motor_claim' AND claim_category IS NULL;
UPDATE public.tasks SET task_type = 'claim' WHERE task_type = 'motor_claim';
UPDATE public.tasks SET workflow = claim_category WHERE workflow IS NULL AND task_type = 'claim';
UPDATE public.tasks SET status = 'open' WHERE status = 'in_progress';

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('draft', 'open', 'awaiting_client', 'completed', 'declined', 'cancelled')) NOT VALID;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_workflow_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_workflow_check CHECK (workflow IS NULL OR workflow IN
  ('motor', 'life', 'health', 'funeral', 'personal', 'commercial', 'request', 'internal_request'));
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_client_rating_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_client_rating_check CHECK (client_rating IS NULL OR client_rating BETWEEN 1 AND 5);
CREATE INDEX IF NOT EXISTS tasks_client_idx ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);

-- ---------------------------------------------------------------------------
-- 6. Task updates: who said what, and whether the client can see it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.task_updates ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'adviser';
ALTER TABLE public.task_updates ADD COLUMN IF NOT EXISTS actor_label text;
ALTER TABLE public.task_updates ADD COLUMN IF NOT EXISTS update_kind text NOT NULL DEFAULT 'stage_change';
ALTER TABLE public.task_updates ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT true;
ALTER TABLE public.task_updates DROP CONSTRAINT IF EXISTS task_updates_actor_type_check;
ALTER TABLE public.task_updates ADD CONSTRAINT task_updates_actor_type_check CHECK (actor_type IN ('client', 'adviser', 'provider', 'system'));
ALTER TABLE public.task_updates DROP CONSTRAINT IF EXISTS task_updates_update_kind_check;
ALTER TABLE public.task_updates ADD CONSTRAINT task_updates_update_kind_check
  CHECK (update_kind IN ('stage_change', 'message', 'file', 'client_action', 'provider_event'));
CREATE INDEX IF NOT EXISTS task_updates_task_idx ON public.task_updates(task_id, created_at);

-- ---------------------------------------------------------------------------
-- 7. Task files: private storage paths, never public URLs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.task_files ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.task_files ADD COLUMN IF NOT EXISTS document_key text;
ALTER TABLE public.task_files ADD COLUMN IF NOT EXISTS content_type text;
ALTER TABLE public.task_files ADD COLUMN IF NOT EXISTS size_bytes integer;
ALTER TABLE public.task_files ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id);
ALTER TABLE public.task_files ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'client';
CREATE INDEX IF NOT EXISTS task_files_task_idx ON public.task_files(task_id);

-- ---------------------------------------------------------------------------
-- 8. Providers: which product lines each one handles, seeded for the demo.
-- ---------------------------------------------------------------------------
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS product_lines text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS reference_prefix text;
ALTER TABLE public.provider_events ADD COLUMN IF NOT EXISTS event_type text;

INSERT INTO public.providers (name, provider_type, integration_mode, mock_endpoint, product_lines, reference_prefix)
SELECT v.name, v.provider_type, 'mock', '/api/mock-provider', v.product_lines, v.reference_prefix
FROM (VALUES
  ('Santam',       'insurer',          ARRAY['motor','personal','commercial'],           'SAN'),
  ('OUTsurance',   'insurer',          ARRAY['motor','personal'],                        'OUT'),
  ('Hollard',      'insurer',          ARRAY['motor','personal','commercial','funeral'], 'HOL'),
  ('Discovery',    'insurer',          ARRAY['health','life','motor'],                   'DSC'),
  ('Momentum',     'insurer',          ARRAY['health','life','request'],                 'MOM'),
  ('Old Mutual',   'insurer',          ARRAY['life','funeral','request'],                'OMU'),
  ('Sanlam',       'insurer',          ARRAY['life','funeral','request'],                'SLM'),
  ('Liberty',      'insurer',          ARRAY['life','request'],                          'LIB'),
  ('Allan Gray',   'investment_house', ARRAY['request'],                                 'AG')
) AS v(name, provider_type, product_lines, reference_prefix)
WHERE NOT EXISTS (SELECT 1 FROM public.providers p WHERE p.name = v.name);
UPDATE public.providers p SET product_lines = v.product_lines, reference_prefix = v.reference_prefix
FROM (VALUES
  ('Santam', ARRAY['motor','personal','commercial'], 'SAN'), ('OUTsurance', ARRAY['motor','personal'], 'OUT'),
  ('Hollard', ARRAY['motor','personal','commercial','funeral'], 'HOL'), ('Discovery', ARRAY['health','life','motor'], 'DSC'),
  ('Momentum', ARRAY['health','life','request'], 'MOM'), ('Old Mutual', ARRAY['life','funeral','request'], 'OMU'),
  ('Sanlam', ARRAY['life','funeral','request'], 'SLM'), ('Liberty', ARRAY['life','request'], 'LIB'),
  ('Allan Gray', ARRAY['request'], 'AG')
) AS v(name, product_lines, reference_prefix)
WHERE p.name = v.name AND p.product_lines = '{}';

-- ---------------------------------------------------------------------------
-- 9. Reminders tied to a task (the 48-hour police report reminder).
-- ---------------------------------------------------------------------------
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id);
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS remind_at timestamptz;

-- ---------------------------------------------------------------------------
-- 10. Access: the Express API uses the service role; nothing else may touch
--     these tables. Files go in a private bucket, served by short-lived signed URLs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.claim_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.claim_categories, public.request_types FROM anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
