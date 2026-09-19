-- Advisor workspace. Apply using the Supabase SQL editor or migrations.
BEGIN;
CREATE TABLE IF NOT EXISTS public.clients (
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
  CONSTRAINT clients_pkey PRIMARY KEY (id),
  CONSTRAINT clients_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES auth.users(id)
);
CREATE TABLE IF NOT EXISTS public.client_dependants (
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
CREATE TABLE IF NOT EXISTS public.client_financial_items (
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
CREATE TABLE IF NOT EXISTS public.client_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  goal_name text NOT NULL,
  goal_type text,
  target_amount numeric,
  target_date date,
  current_progress numeric DEFAULT 0,
  status text DEFAULT 'in_progress'::text,
  CONSTRAINT client_goals_pkey PRIMARY KEY (id),
  CONSTRAINT client_goals_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
REVOKE ALL ON public.clients FROM anon;
DROP POLICY IF EXISTS advisor_access ON public.clients;
CREATE POLICY advisor_access ON public.clients FOR ALL TO authenticated USING (advisor_id = (select auth.uid())) WITH CHECK (advisor_id = (select auth.uid()));
-- Restrictive ownership also constrains any pre-existing permissive policies.
DROP POLICY IF EXISTS advisor_ownership_guard ON public.clients;
CREATE POLICY advisor_ownership_guard ON public.clients AS RESTRICTIVE FOR ALL TO authenticated USING (advisor_id = (select auth.uid())) WITH CHECK (advisor_id = (select auth.uid()));

ALTER TABLE public.client_dependants ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_dependants TO authenticated;
REVOKE ALL ON public.client_dependants FROM anon;
DROP POLICY IF EXISTS advisor_access ON public.client_dependants;
CREATE POLICY advisor_access ON public.client_dependants FOR ALL TO authenticated USING (exists (select 1 from public.clients c where c.id = client_dependants.client_id and c.advisor_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.clients c where c.id = client_dependants.client_id and c.advisor_id = (select auth.uid())));
-- Restrictive ownership also constrains any pre-existing permissive policies.
DROP POLICY IF EXISTS advisor_ownership_guard ON public.client_dependants;
CREATE POLICY advisor_ownership_guard ON public.client_dependants AS RESTRICTIVE FOR ALL TO authenticated USING (exists (select 1 from public.clients c where c.id = client_dependants.client_id and c.advisor_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.clients c where c.id = client_dependants.client_id and c.advisor_id = (select auth.uid())));

ALTER TABLE public.client_financial_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_financial_items TO authenticated;
REVOKE ALL ON public.client_financial_items FROM anon;
DROP POLICY IF EXISTS advisor_access ON public.client_financial_items;
CREATE POLICY advisor_access ON public.client_financial_items FOR ALL TO authenticated USING (exists (select 1 from public.clients c where c.id = client_financial_items.client_id and c.advisor_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.clients c where c.id = client_financial_items.client_id and c.advisor_id = (select auth.uid())));
-- Restrictive ownership also constrains any pre-existing permissive policies.
DROP POLICY IF EXISTS advisor_ownership_guard ON public.client_financial_items;
CREATE POLICY advisor_ownership_guard ON public.client_financial_items AS RESTRICTIVE FOR ALL TO authenticated USING (exists (select 1 from public.clients c where c.id = client_financial_items.client_id and c.advisor_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.clients c where c.id = client_financial_items.client_id and c.advisor_id = (select auth.uid())));

ALTER TABLE public.client_goals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_goals TO authenticated;
REVOKE ALL ON public.client_goals FROM anon;
DROP POLICY IF EXISTS advisor_access ON public.client_goals;
CREATE POLICY advisor_access ON public.client_goals FOR ALL TO authenticated USING (exists (select 1 from public.clients c where c.id = client_goals.client_id and c.advisor_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.clients c where c.id = client_goals.client_id and c.advisor_id = (select auth.uid())));
-- Restrictive ownership also constrains any pre-existing permissive policies.
DROP POLICY IF EXISTS advisor_ownership_guard ON public.client_goals;
CREATE POLICY advisor_ownership_guard ON public.client_goals AS RESTRICTIVE FOR ALL TO authenticated USING (exists (select 1 from public.clients c where c.id = client_goals.client_id and c.advisor_id = (select auth.uid()))) WITH CHECK (exists (select 1 from public.clients c where c.id = client_goals.client_id and c.advisor_id = (select auth.uid())));

CREATE INDEX IF NOT EXISTS clients_advisor_idx ON public.clients(advisor_id);
CREATE INDEX IF NOT EXISTS dependants_client_idx ON public.client_dependants(client_id);
CREATE INDEX IF NOT EXISTS financial_items_client_idx ON public.client_financial_items(client_id);
CREATE INDEX IF NOT EXISTS goals_client_idx ON public.client_goals(client_id);

-- All FNA writes succeed or roll back together; caller privileges and RLS apply.
CREATE OR REPLACE FUNCTION public.save_client_fna(
  p_id uuid, p_profile jsonb, p_dependants jsonb, p_items jsonb, p_goals jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_profile public.clients;
  v_row jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before saving a client'; END IF;
  IF jsonb_typeof(p_profile) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_dependants) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_goals) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid financial needs analysis payload';
  END IF;
  v_profile := jsonb_populate_record(NULL::public.clients, p_profile);
  IF nullif(trim(v_profile.first_name), '') IS NULL OR nullif(trim(v_profile.surname), '') IS NULL THEN
    RAISE EXCEPTION 'First name and surname are required';
  END IF;
  IF v_profile.annual_income < 0 OR v_profile.risk_profile_score < 0 OR v_profile.date_of_birth > current_date THEN
    RAISE EXCEPTION 'Check income, risk score, and date of birth';
  END IF;
  IF coalesce(v_profile.is_politically_exposed, false) AND nullif(trim(v_profile.pep_details), '') IS NULL THEN
    RAISE EXCEPTION 'Political exposure details are required';
  END IF;
  IF v_profile.status IS NULL OR v_profile.status NOT IN ('onboarding', 'active', 'inactive') THEN RAISE EXCEPTION 'Invalid client status'; END IF;
  IF (SELECT coalesce(sum((d->>'beneficiary_percentage')::numeric), 0) FROM jsonb_array_elements(p_dependants) d) > 100 THEN
    RAISE EXCEPTION 'Beneficiary allocations cannot exceed 100 percent';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.clients WHERE id = p_id AND advisor_id = auth.uid() FOR UPDATE;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Client not found or access denied'; END IF;
  ELSE
    v_id := gen_random_uuid();
    INSERT INTO public.clients(id, advisor_id, first_name, surname) VALUES(v_id, auth.uid(), v_profile.first_name, v_profile.surname);
  END IF;
  UPDATE public.clients SET first_name = v_profile.first_name,
    second_name = v_profile.second_name,
    surname = v_profile.surname,
    id_number = v_profile.id_number,
    date_of_birth = v_profile.date_of_birth,
    nationality = v_profile.nationality,
    marital_status = v_profile.marital_status,
    occupation = v_profile.occupation,
    employer_name = v_profile.employer_name,
    annual_income = v_profile.annual_income,
    is_politically_exposed = v_profile.is_politically_exposed,
    pep_details = v_profile.pep_details,
    risk_profile_score = v_profile.risk_profile_score,
    risk_profile_category = v_profile.risk_profile_category,
    contact_email = v_profile.contact_email,
    contact_mobile = v_profile.contact_mobile,
    physical_address = v_profile.physical_address,
    status = v_profile.status WHERE id = v_id;

  DELETE FROM public.client_dependants WHERE client_id = v_id;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_dependants) LOOP
    IF nullif(trim(v_row->>'full_name'), '') IS NULL OR (v_row->>'beneficiary_percentage')::numeric < 0
      OR (v_row->>'beneficiary_percentage')::numeric > 100 OR (v_row->>'date_of_birth')::date > current_date THEN
      RAISE EXCEPTION 'Invalid dependant name, date of birth, or beneficiary allocation';
    END IF;
    INSERT INTO public.client_dependants(id, client_id, full_name, relationship, date_of_birth, id_number, beneficiary_percentage)
    VALUES(coalesce((v_row->>'id')::uuid, gen_random_uuid()), v_id, trim(v_row->>'full_name'), v_row->>'relationship', (v_row->>'date_of_birth')::date, v_row->>'id_number', (v_row->>'beneficiary_percentage')::numeric);
  END LOOP;
  DELETE FROM public.client_financial_items WHERE client_id = v_id;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF v_row->>'category' IS NULL OR v_row->>'category' NOT IN ('asset', 'liability', 'income', 'expense')
      OR nullif(trim(v_row->>'item_type'), '') IS NULL OR (v_row->>'amount')::numeric IS NULL OR (v_row->>'amount')::numeric < 0
      OR (v_row->>'interest_rate')::numeric < 0 OR (v_row->>'interest_rate')::numeric > 100 THEN
      RAISE EXCEPTION 'Invalid financial item';
    END IF;
    INSERT INTO public.client_financial_items(id, client_id, category, item_type, description, amount, frequency, interest_rate)
    VALUES(coalesce((v_row->>'id')::uuid, gen_random_uuid()), v_id, v_row->>'category', trim(v_row->>'item_type'), v_row->>'description', (v_row->>'amount')::numeric, v_row->>'frequency', (v_row->>'interest_rate')::numeric);
  END LOOP;
  DELETE FROM public.client_goals WHERE client_id = v_id;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_goals) LOOP
    IF nullif(trim(v_row->>'goal_name'), '') IS NULL OR (v_row->>'target_amount')::numeric IS NULL OR (v_row->>'target_amount')::numeric <= 0
      OR (v_row->>'current_progress')::numeric IS NULL OR (v_row->>'current_progress')::numeric < 0
      OR v_row->>'status' IS NULL OR v_row->>'status' NOT IN ('in_progress', 'completed', 'on_hold') THEN
      RAISE EXCEPTION 'Invalid goal name, target, progress, or status';
    END IF;
    INSERT INTO public.client_goals(id, client_id, goal_name, goal_type, target_amount, target_date, current_progress, status)
    VALUES(coalesce((v_row->>'id')::uuid, gen_random_uuid()), v_id, trim(v_row->>'goal_name'), v_row->>'goal_type', (v_row->>'target_amount')::numeric, (v_row->>'target_date')::date, (v_row->>'current_progress')::numeric, v_row->>'status');
  END LOOP;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_client_fna(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_client_fna(uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated;
COMMIT;
