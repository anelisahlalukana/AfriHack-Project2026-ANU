-- Apply after 202609190001_advisor_workspace.sql BEFORE enabling public signup.
-- Public registrations have no staff role. Only the Admin API/SQL may set app_metadata.
-- Only 'advisor' touches client FNA data directly: 'admin' is user-management only
-- (no client data access), and 'provider' is not a logged-in role — it's the mocked
-- external insurer/integration layer (see docs/system_requirments.md).
BEGIN;

DROP POLICY IF EXISTS staff_role_guard ON public.clients;
CREATE POLICY staff_role_guard ON public.clients
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor'))
  WITH CHECK (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor'));

DROP POLICY IF EXISTS staff_role_guard ON public.client_dependants;
CREATE POLICY staff_role_guard ON public.client_dependants
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor'))
  WITH CHECK (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor'));

DROP POLICY IF EXISTS staff_role_guard ON public.client_financial_items;
CREATE POLICY staff_role_guard ON public.client_financial_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor'))
  WITH CHECK (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor'));

DROP POLICY IF EXISTS staff_role_guard ON public.client_goals;
CREATE POLICY staff_role_guard ON public.client_goals
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor'))
  WITH CHECK (coalesce((select auth.jwt())->'app_metadata'->>'role', 'client') IN ('advisor'));

COMMIT;
