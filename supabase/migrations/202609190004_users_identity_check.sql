-- Clients only need a first name in the database. Self-registered clients enter a
-- single "full name" at sign-up (which may be one word); advisors still have to
-- give a surname when onboarding a client because ClientForm requires it.
-- Providers are identified by organisation_name instead of a person's name.
-- Role id 2 = provider (see the roles table).
BEGIN;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_identity_required;
ALTER TABLE public.users ADD CONSTRAINT users_identity_required CHECK (
  CASE role_id
    WHEN 2 THEN organisation_name IS NOT NULL
    ELSE first_name IS NOT NULL
  END
);

COMMIT;
