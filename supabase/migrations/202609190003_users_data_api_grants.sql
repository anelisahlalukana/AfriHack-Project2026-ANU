-- Table privileges for the unified public.users table and the tables the client
-- overview reads. Safe to re-run.
--
-- Row-level security and policies already exist on these tables, but without
-- table privileges the API role gets "42501 permission denied" before any
-- policy is evaluated. anon gets nothing; signed-in users get what the app needs
-- and the policies decide which rows.
BEGIN;

REVOKE ALL ON public.users, public.client_dependants, public.client_financial_items, public.client_goals, public.roles FROM anon;

GRANT ALL ON public.users, public.client_dependants, public.client_financial_items, public.client_goals, public.roles TO service_role;

GRANT SELECT ON public.roles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_dependants, public.client_financial_items, public.client_goals TO authenticated;

-- UPDATE on users is limited to profile columns. The policies let a client update
-- their own row, so without this a client could rewrite role_id, advisor_id or
-- auth_user_id on it.
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (
  first_name, second_name, surname, id_number, date_of_birth, nationality,
  marital_status, occupation, employer_name, annual_income, is_politically_exposed,
  pep_details, risk_profile_score, risk_profile_category, contact_email,
  contact_mobile, physical_address, status, bank_name, bank_account_number,
  bank_account_type, debit_order_day
) ON public.users TO authenticated;

GRANT EXECUTE ON FUNCTION public.save_client_fna(uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_role_name() TO authenticated;

COMMIT;
