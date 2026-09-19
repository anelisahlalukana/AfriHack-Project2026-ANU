-- Requires the existing users/auth/adviser_compliance schema (see docs/schema.md).
-- No client data or historic migrations are changed. Apply to a disposable DB first.
BEGIN;

CREATE TABLE IF NOT EXISTS public.client_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.users(id),
  screening_type text NOT NULL CHECK (screening_type IN ('pep', 'terrorism_financing')),
  result text NOT NULL CHECK (result IN ('clear', 'flagged')),
  provider text NOT NULL,
  simulated boolean NOT NULL DEFAULT true,
  simulated_flag boolean NOT NULL DEFAULT false,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.adviser_cpd_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adviser_id uuid NOT NULL REFERENCES auth.users(id),
  activity text NOT NULL CHECK (length(btrim(activity)) BETWEEN 1 AND 200),
  hours numeric NOT NULL CHECK (hours > 0 AND hours <= 100 AND hours = round(hours, 2)),
  completed_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.compliance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('screening_performed', 'consent_signed', 'consent_renewed',
    'adviser_compliance_updated', 'cpd_record_added', 'financial_pull_allowed', 'financial_pull_blocked')),
  summary text NOT NULL,
  result text NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  actor_name text NOT NULL,
  client_id uuid REFERENCES public.users(id),
  adviser_id uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fail clearly rather than silently accepting tables left by an incompatible prototype.
DO $$
DECLARE expected record; actual_type text;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('client_screenings','id','uuid'), ('client_screenings','client_id','uuid'),
    ('client_screenings','screening_type','text'), ('client_screenings','result','text'),
    ('client_screenings','provider','text'), ('client_screenings','simulated','boolean'),
    ('client_screenings','simulated_flag','boolean'), ('client_screenings','actor_id','uuid'),
    ('client_screenings','created_at','timestamp with time zone'),
    ('adviser_cpd_records','id','uuid'), ('adviser_cpd_records','adviser_id','uuid'),
    ('adviser_cpd_records','activity','text'), ('adviser_cpd_records','hours','numeric'),
    ('adviser_cpd_records','completed_on','date'), ('adviser_cpd_records','created_at','timestamp with time zone'),
    ('compliance_audit_log','id','uuid'), ('compliance_audit_log','event_type','text'),
    ('compliance_audit_log','summary','text'), ('compliance_audit_log','result','text'),
    ('compliance_audit_log','actor_id','uuid'), ('compliance_audit_log','actor_name','text'),
    ('compliance_audit_log','client_id','uuid'), ('compliance_audit_log','adviser_id','uuid'),
    ('compliance_audit_log','metadata','jsonb'), ('compliance_audit_log','created_at','timestamp with time zone')
  ) AS columns(table_name, column_name, data_type)
  LOOP
    SELECT c.data_type INTO actual_type FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = expected.table_name AND c.column_name = expected.column_name;
    IF actual_type IS DISTINCT FROM expected.data_type THEN
      RAISE EXCEPTION 'Incompatible compliance column %.%: expected %', expected.table_name, expected.column_name, expected.data_type;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('client_screenings','adviser_cpd_records','compliance_audit_log')) THEN
    RAISE EXCEPTION 'Unexpected compliance RLS policies; review them before applying this migration';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS client_screenings_latest_idx ON public.client_screenings(client_id, screening_type, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS adviser_cpd_cycle_idx ON public.adviser_cpd_records(adviser_id, completed_on);
CREATE INDEX IF NOT EXISTS compliance_audit_recent_idx ON public.compliance_audit_log(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS compliance_audit_client_idx ON public.compliance_audit_log(client_id, created_at DESC, id DESC);

ALTER TABLE public.client_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adviser_cpd_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adviser_compliance ENABLE ROW LEVEL SECURITY;
-- Existing adviser compliance is API-only; browser grants must not bypass self-only writes.
REVOKE ALL ON public.client_screenings, public.adviser_cpd_records, public.compliance_audit_log, public.adviser_compliance FROM PUBLIC, anon, authenticated;
-- Table REVOKE does not remove separately granted column privileges.
DO $$
DECLARE t text; columns_sql text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client_screenings','adviser_cpd_records','compliance_audit_log','adviser_compliance'] LOOP
    SELECT string_agg(quote_ident(column_name), ',') INTO columns_sql FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t;
    EXECUTE format('REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.%I FROM PUBLIC, anon, authenticated',
      columns_sql, columns_sql, columns_sql, columns_sql, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_screenings, public.adviser_cpd_records, public.adviser_compliance TO service_role;
REVOKE ALL ON public.compliance_audit_log FROM service_role;
GRANT SELECT, INSERT ON public.compliance_audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.compliance_reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Compliance audit records are append-only';
END $$;
DROP TRIGGER IF EXISTS compliance_audit_immutable ON public.compliance_audit_log;
CREATE TRIGGER compliance_audit_immutable BEFORE UPDATE OR DELETE ON public.compliance_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.compliance_reject_audit_mutation();
DROP TRIGGER IF EXISTS compliance_audit_no_truncate ON public.compliance_audit_log;
CREATE TRIGGER compliance_audit_no_truncate BEFORE TRUNCATE ON public.compliance_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.compliance_reject_audit_mutation();
REVOKE ALL ON FUNCTION public.compliance_reject_audit_mutation() FROM PUBLIC, anon, authenticated;

-- One service-only RPC keeps each owned mutation and its audit entry atomic.
-- The API supplies actor identity from verified authentication, never from the body.
CREATE OR REPLACE FUNCTION public.compliance_record_change(
  p_kind text, p_target uuid, p_values jsonb, p_actor uuid, p_actor_name text, p_audit jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_record jsonb;
  v_client uuid;
  v_adviser uuid;
  v_day date := (now() AT TIME ZONE 'Africa/Johannesburg')::date;
  v_start date;
  v_hours numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor AND raw_app_meta_data->>'role' = 'advisor') THEN
    RAISE EXCEPTION 'Advisor identity required';
  END IF;
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR length(btrim(p_actor_name)) = 0 THEN
    RAISE EXCEPTION 'Invalid compliance change';
  END IF;
  IF p_kind = 'screening' THEN
    IF p_audit->>'event_type' IS DISTINCT FROM 'screening_performed' THEN RAISE EXCEPTION 'Invalid audit event'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_target AND role_id = 1) THEN
      RAISE EXCEPTION 'Client not found';
    END IF;
    v_client := p_target;
    INSERT INTO public.client_screenings(client_id, screening_type, result, provider, simulated, simulated_flag, actor_id)
    VALUES (p_target, p_values->>'screening_type', p_values->>'result', p_values->>'provider', true,
      coalesce((p_values->>'simulated_flag')::boolean, false), p_actor)
    RETURNING to_jsonb(client_screenings.*) INTO v_record;
  ELSIF p_kind IN ('adviser', 'cpd') THEN
    IF p_target <> p_actor THEN RAISE EXCEPTION 'Only the adviser may update their own record'; END IF;
    v_adviser := p_target;
    -- Serializes CPD totals and profile updates for the same adviser, including first insert.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_target::text, 0));
    INSERT INTO public.adviser_compliance(adviser_id) VALUES (p_target) ON CONFLICT (adviser_id) DO NOTHING;
    IF p_kind = 'adviser' THEN
      IF p_audit->>'event_type' IS DISTINCT FROM 'adviser_compliance_updated' THEN RAISE EXCEPTION 'Invalid audit event'; END IF;
      IF p_values ? 'qualification_status' AND p_values->>'qualification_status' NOT IN ('qualified','pending','suspended') THEN
        RAISE EXCEPTION 'Invalid qualification status';
      END IF;
      UPDATE public.adviser_compliance SET
        qualification_status = CASE WHEN p_values ? 'qualification_status' THEN p_values->>'qualification_status' ELSE qualification_status END,
        is_politically_exposed = CASE WHEN p_values ? 'is_politically_exposed' THEN (p_values->>'is_politically_exposed')::boolean ELSE is_politically_exposed END,
        pep_details = CASE WHEN p_values ? 'pep_details' THEN p_values->>'pep_details' ELSE pep_details END,
        terrorism_financing_flag = CASE WHEN p_values ? 'terrorism_financing_flag' THEN (p_values->>'terrorism_financing_flag')::boolean ELSE terrorism_financing_flag END,
        terrorism_financing_details = CASE WHEN p_values ? 'terrorism_financing_details' THEN p_values->>'terrorism_financing_details' ELSE terrorism_financing_details END,
        updated_at = now()
      WHERE adviser_id = p_target RETURNING to_jsonb(adviser_compliance.*) INTO v_record;
    ELSE
      IF p_audit->>'event_type' IS DISTINCT FROM 'cpd_record_added' THEN RAISE EXCEPTION 'Invalid audit event'; END IF;
      IF (p_values->>'completed_on')::date > v_day THEN RAISE EXCEPTION 'CPD completion cannot be in the future'; END IF;
      INSERT INTO public.adviser_cpd_records(adviser_id, activity, hours, completed_on)
      VALUES (p_target, btrim(p_values->>'activity'), (p_values->>'hours')::numeric, (p_values->>'completed_on')::date)
      RETURNING to_jsonb(adviser_cpd_records.*) INTO v_record;
      -- Mirrors the documented June/18-hour prototype policy in compliance.js.
      v_start := make_date(extract(year FROM v_day)::integer - CASE WHEN extract(month FROM v_day) < 6 THEN 1 ELSE 0 END, 6, 1);
      SELECT coalesce(sum(hours), 0) INTO v_hours FROM public.adviser_cpd_records
        WHERE adviser_id = p_target AND completed_on >= v_start AND completed_on < v_start + interval '1 year';
      UPDATE public.adviser_compliance SET cpd_status = CASE WHEN v_hours >= 18 THEN 'up_to_date'
        WHEN v_hours > 0 THEN 'in_progress' ELSE 'not_started' END, updated_at = now() WHERE adviser_id = p_target;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported compliance change';
  END IF;
  INSERT INTO public.compliance_audit_log(event_type, summary, result, actor_id, actor_name, client_id, adviser_id, metadata)
  VALUES (p_audit->>'event_type', p_audit->>'summary', p_audit->>'result', p_actor, p_actor_name, v_client, v_adviser,
    coalesce(p_audit->'metadata', '{}'::jsonb) || jsonb_build_object('recordId', v_record->>'id'));
  RETURN v_record;
END $$;
REVOKE ALL ON FUNCTION public.compliance_record_change(text,uuid,jsonb,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_record_change(text,uuid,jsonb,uuid,text,jsonb) TO service_role;
COMMIT;
