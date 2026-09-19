-- Gives the backend's database role (service_role) access to every table in the
-- public schema. Safe to re-run.
--
-- The Express server talks to Postgres with the service-role key. On this project
-- some tables (documents, adviser_compliance, ...) were created without table
-- privileges for that role, so server calls fail with
-- "42501 permission denied for table documents" before row-level security is even
-- considered. service_role is backend-only (its key never reaches the browser) and
-- bypasses RLS by design, so this does not open anything to signed-in users or the
-- public: anon and authenticated privileges are not touched here.
BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Tables created later by this role get the same access automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

COMMIT;
