-- Audit log: one read-only feed over every activity source in the product.
--
-- Three sources are normalised into a single shape so the API can filter, sort,
-- page and count them in the database rather than in Node:
--   compliance  - public.compliance_audit_log  (screenings, consents, CPD, adviser records)
--   task        - public.task_updates          (claim and request activity)
--   provider    - public.provider_events       (correspondence with an insurer)
--
-- Role scoping is applied by the API on top of this view (see
-- server/src/services/auditLog.service.js), using owner_adviser_id, actor_id and
-- provider_id. The view itself deliberately carries every row: it is reachable
-- only through the service role, never from the browser.
--
-- The claims tables (tasks, task_updates, provider_events) and public.users are
-- created outside this migrations folder. The view is therefore built with dynamic
-- SQL over whichever sources are actually present, so this file applies cleanly to
-- a database that only has the compliance tables.

DO $$
DECLARE
  parts text[] := ARRAY[]::text[];
  has_users boolean;
  has_tasks boolean;
BEGIN
  SELECT to_regclass('public.users') IS NOT NULL INTO has_users;
  SELECT to_regclass('public.tasks') IS NOT NULL
     AND to_regclass('public.task_updates') IS NOT NULL INTO has_tasks;

  IF to_regclass('public.compliance_audit_log') IS NOT NULL THEN
    parts := parts || format($part$
      SELECT
        l.id,
        l.created_at                                   AS occurred_at,
        'compliance'::text                             AS source,
        l.event_type                                   AS category,
        l.summary                                      AS summary,
        l.result                                       AS result,
        l.actor_name                                   AS actor_name,
        'staff'::text                                  AS actor_type,
        l.actor_id                                     AS actor_id,
        l.client_id                                    AS client_id,
        %s                                             AS client_name,
        COALESCE(l.adviser_id, %s)                     AS owner_adviser_id,
        NULL::uuid                                     AS provider_id,
        NULL::text                                     AS provider_name,
        NULL::uuid                                     AS task_id,
        NULL::text                                     AS task_reference,
        TRUE                                           AS internal_only,
        l.metadata                                     AS metadata
      FROM public.compliance_audit_log l
      %s
    $part$,
      CASE WHEN has_users THEN 'NULLIF(BTRIM(CONCAT_WS('' '', cu.first_name, cu.surname)), '''')' ELSE 'NULL::text' END,
      CASE WHEN has_users THEN 'cu.advisor_id' ELSE 'NULL::uuid' END,
      CASE WHEN has_users THEN 'LEFT JOIN public.users cu ON cu.id = l.client_id' ELSE '' END
    );
  END IF;

  IF has_tasks THEN
    parts := parts || $part$
      SELECT
        u.id,
        u.created_at                                   AS occurred_at,
        'task'::text                                   AS source,
        COALESCE(u.update_kind, 'note')                AS category,
        u.note                                         AS summary,
        t.status                                       AS result,
        COALESCE(u.actor_label, 'System')              AS actor_name,
        COALESCE(u.actor_type, 'system')               AS actor_type,
        NULL::uuid                                     AS actor_id,
        t.client_id                                    AS client_id,
        NULLIF(BTRIM(CONCAT_WS(' ', c.first_name, c.surname)), '') AS client_name,
        c.advisor_id                                   AS owner_adviser_id,
        t.provider_id                                  AS provider_id,
        p.organisation_name                            AS provider_name,
        t.id                                           AS task_id,
        t.reference                                    AS task_reference,
        NOT COALESCE(u.visible_to_client, FALSE)       AS internal_only,
        jsonb_build_object('stage', u.stage, 'taskType', t.task_type, 'workflow', t.workflow) AS metadata
      FROM public.task_updates u
      JOIN public.tasks t ON t.id = u.task_id
      LEFT JOIN public.users c ON c.id = t.client_id
      LEFT JOIN public.users p ON p.id = t.provider_id
    $part$;
  END IF;

  IF has_tasks AND to_regclass('public.provider_events') IS NOT NULL THEN
    parts := parts || $part$
      SELECT
        e.id,
        e.created_at                                   AS occurred_at,
        'provider'::text                               AS source,
        e.event_type                                   AS category,
        CONCAT_WS(' ',
          CASE WHEN e.direction = 'sent' THEN 'Sent to' ELSE 'Received from' END,
          COALESCE(p.organisation_name, 'the provider'),
          '-', REPLACE(e.event_type, '_', ' '))        AS summary,
        e.direction                                    AS result,
        COALESCE(e.payload->>'by', p.organisation_name, 'Provider') AS actor_name,
        'provider'::text                               AS actor_type,
        NULL::uuid                                     AS actor_id,
        t.client_id                                    AS client_id,
        NULLIF(BTRIM(CONCAT_WS(' ', c.first_name, c.surname)), '') AS client_name,
        c.advisor_id                                   AS owner_adviser_id,
        e.provider_id                                  AS provider_id,
        p.organisation_name                            AS provider_name,
        t.id                                           AS task_id,
        t.reference                                    AS task_reference,
        FALSE                                          AS internal_only,
        COALESCE(e.payload, '{}'::jsonb)               AS metadata
      FROM public.provider_events e
      JOIN public.tasks t ON t.id = e.task_id
      LEFT JOIN public.users c ON c.id = t.client_id
      LEFT JOIN public.users p ON p.id = e.provider_id
    $part$;
  END IF;

  IF array_length(parts, 1) IS NULL THEN
    RAISE EXCEPTION 'No audit sources found. Apply 202609190012_compliance.sql (and the claims tables) first.';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.audit_events AS ' || array_to_string(parts, ' UNION ALL ');
END $$;

-- security_invoker keeps the view from becoming a way around the base tables' RLS.
-- Every base table already revokes access from anon/authenticated, so the view is
-- reachable only with the service role that the API uses.
ALTER VIEW public.audit_events SET (security_invoker = on);

REVOKE ALL ON public.audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_events TO service_role;

-- Sorting and paging always run newest-first over occurred_at, and the common
-- filters are the scoping columns.
CREATE INDEX IF NOT EXISTS compliance_audit_actor_idx
  ON public.compliance_audit_log(actor_id, created_at DESC, id DESC);

DO $$
BEGIN
  IF to_regclass('public.task_updates') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS task_updates_recent_idx ON public.task_updates(created_at DESC, id DESC)';
  END IF;
  IF to_regclass('public.provider_events') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS provider_events_recent_idx ON public.provider_events(provider_id, created_at DESC, id DESC)';
  END IF;
END $$;
