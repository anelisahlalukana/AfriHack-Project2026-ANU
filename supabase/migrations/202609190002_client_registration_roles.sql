-- Apply after 202609190001_advisor_workspace.sql BEFORE enabling public signup.
-- Public registrations have no staff role. Only the Admin API/SQL may set app_metadata.
BEGIN;

DROP POLICY IF EXISTS staff_role_guard ON public.clients;
CREATE POLICY staff_role_guard ON public.clients
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor', 'provider', 'broker'))
  WITH CHECK (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor', 'provider', 'broker'));

DROP POLICY IF EXISTS staff_role_guard ON public.client_dependants;
CREATE POLICY staff_role_guard ON public.client_dependants
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor', 'provider', 'broker'))
  WITH CHECK (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor', 'provider', 'broker'));

DROP POLICY IF EXISTS staff_role_guard ON public.client_financial_items;
CREATE POLICY staff_role_guard ON public.client_financial_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor', 'provider', 'broker'))
  WITH CHECK (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor', 'provider', 'broker'));

DROP POLICY IF EXISTS staff_role_guard ON public.client_goals;
CREATE POLICY staff_role_guard ON public.client_goals
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor', 'provider', 'broker'))
  WITH CHECK (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor', 'provider', 'broker'));

COMMIT;
