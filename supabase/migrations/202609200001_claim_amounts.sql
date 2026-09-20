-- Claim amounts for financial reporting (Reports: average claim size, rand value per week,
-- payout rate by insurer). Two optional columns on tasks; nothing else changes.
--   claimed_amount  what the client claimed (ZAR), recorded when the claim is logged
--   settled_amount  what the insurer paid out (ZAR); 0 for a declined claim, NULL while open
-- Safe to re-run. Existing rows keep NULL (reports treat NULL as "not recorded").
BEGIN;
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS claimed_amount numeric,
  ADD COLUMN IF NOT EXISTS settled_amount numeric;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_claim_amounts_non_negative') THEN
    ALTER TABLE public.tasks ADD CONSTRAINT tasks_claim_amounts_non_negative
      CHECK ((claimed_amount IS NULL OR claimed_amount >= 0) AND (settled_amount IS NULL OR settled_amount >= 0));
  END IF;
END $$;

COMMENT ON COLUMN public.tasks.claimed_amount IS 'Amount claimed by the client, ZAR (claims only; NULL if not recorded).';
COMMENT ON COLUMN public.tasks.settled_amount IS 'Amount paid out by the insurer, ZAR (0 when declined; NULL while open or not recorded).';
COMMIT;
