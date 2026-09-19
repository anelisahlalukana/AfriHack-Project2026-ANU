-- Additive Dev 4 migration for the shared users-based schema. No client data is seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS public.reminder_rules (
  id text PRIMARY KEY, title text NOT NULL,
  repeat_months integer NOT NULL DEFAULT 0 CHECK (repeat_months BETWEEN 0 AND 120),
  audience text NOT NULL CHECK (audience IN ('client','adviser','both')),
  enabled boolean NOT NULL DEFAULT true
);
INSERT INTO public.reminder_rules (id,title,repeat_months,audience) VALUES
 ('valuation','Insurance valuation certificate',24,'both'),
 ('licence','Driving licence expiry',0,'client'),
 ('annual-review','Annual review meeting',12,'both'),
 ('retirement-fee','Retirement fee renewal',12,'adviser'),
 ('birthday','Birthday',12,'both'), ('anniversary','Anniversary',12,'client')
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.reminders
 ADD COLUMN IF NOT EXISTS rule_id text REFERENCES public.reminder_rules(id),
 ADD COLUMN IF NOT EXISTS repeat_months integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS anchor_date date,
 ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
 ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.notifications
 ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES auth.users(id),
 ADD COLUMN IF NOT EXISTS event_key text,
 ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'notifications',
 ADD COLUMN IF NOT EXISTS read_at timestamptz,
 ADD COLUMN IF NOT EXISTS push_status text NOT NULL DEFAULT 'pending',
 ADD COLUMN IF NOT EXISTS push_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS push_lease_until timestamptz,
 ADD COLUMN IF NOT EXISTS push_lease_token uuid,
 ADD COLUMN IF NOT EXISTS delivered_to text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_recipient ON public.notifications(event_key,recipient_user_id);
CREATE TABLE IF NOT EXISTS public.client_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.users(id),
 sender_id uuid NOT NULL REFERENCES auth.users(id), sender_name text NOT NULL,
 sender_role text NOT NULL CHECK (sender_role IN ('client','adviser')),
 body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_messages_conversation ON public.client_messages(client_id,created_at);
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
 endpoint text PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 keys jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.financial_snapshots (
 client_id uuid PRIMARY KEY REFERENCES public.users(id), data jsonb NOT NULL,
 pulled_at timestamptz NOT NULL DEFAULT now()
);
-- The API verifies identity and scopes each operation. New tables have no direct browser grants.
ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reminder_rules, public.client_messages, public.push_subscriptions, public.financial_snapshots FROM anon, authenticated;
GRANT ALL ON public.reminder_rules, public.client_messages, public.push_subscriptions, public.financial_snapshots TO service_role;

-- Atomic notification fan-out. Only the backend can execute these functions.
CREATE OR REPLACE FUNCTION public.dev4_publish_event(p_client_id uuid, p_event_key text, p_title text, p_body text, p_audience text, p_section text DEFAULT 'notifications', p_reminder_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF p_audience NOT IN ('client','adviser','both') THEN RAISE EXCEPTION 'Invalid audience'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_client_id AND role_id=1) THEN RAISE EXCEPTION 'Client not found'; END IF;
 INSERT INTO public.notifications(client_id,title,body,recipient,advisor_id,recipient_user_id,event_key,section,related_reminder_id)
 SELECT p_client_id,p_title,p_body,'advisor',a.id,a.id,p_event_key,p_section,p_reminder_id
 FROM auth.users a WHERE a.raw_app_meta_data->>'role'='advisor' AND p_audience<>'client'
 ON CONFLICT (event_key,recipient_user_id) DO NOTHING;
 INSERT INTO public.notifications(client_id,title,body,recipient,recipient_user_id,event_key,section,related_reminder_id)
 SELECT c.id,p_title,p_body,'client',COALESCE(c.auth_user_id,c.client_user_id),p_event_key,p_section,p_reminder_id
 FROM public.users c WHERE c.id=p_client_id AND p_audience<>'adviser'
 AND COALESCE(c.auth_user_id,c.client_user_id) IS NOT NULL
 AND (c.auth_user_id IS NULL OR c.client_user_id IS NULL OR c.auth_user_id=c.client_user_id)
 ON CONFLICT (event_key,recipient_user_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.dev4_send_message(p_client_id uuid,p_sender_id uuid,p_sender_name text,p_sender_role text,p_body text)
RETURNS public.client_messages LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE m public.client_messages;
BEGIN
 INSERT INTO public.client_messages(client_id,sender_id,sender_name,sender_role,body)
 VALUES(p_client_id,p_sender_id,p_sender_name,p_sender_role,p_body) RETURNING * INTO m;
 PERFORM public.dev4_publish_event(p_client_id,'message:'||m.id,'New message',
 'You have a new message. Open Messages to read it.',CASE WHEN p_sender_role='adviser' THEN 'client' ELSE 'adviser' END,'messages');
 RETURN m;
END $$;

CREATE OR REPLACE FUNCTION public.dev4_run_reminders()
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r public.reminders; sent integer:=0; today date:=(now() AT TIME ZONE 'Africa/Johannesburg')::date; next_date date; n integer;
BEGIN
 -- Row locks prevent two server processes from delivering the same occurrence.
 FOR r IN SELECT x.* FROM public.reminders x JOIN public.reminder_rules rules ON rules.id=x.rule_id
 WHERE x.status='pending' AND x.trigger_date<=today AND rules.enabled
 ORDER BY x.trigger_date LIMIT 200 FOR UPDATE OF x SKIP LOCKED LOOP
   -- Keep an undeliverable occurrence pending until an account is linked.
   IF NOT (
     (r.recipient<>'client' AND EXISTS(SELECT 1 FROM auth.users a WHERE a.raw_app_meta_data->>'role'='advisor'))
     OR (r.recipient<>'adviser' AND EXISTS(SELECT 1 FROM public.users c WHERE c.id=r.client_id
       AND COALESCE(c.auth_user_id,c.client_user_id) IS NOT NULL
       AND (c.auth_user_id IS NULL OR c.client_user_id IS NULL OR c.auth_user_id=c.client_user_id)))
   ) THEN CONTINUE; END IF;
   PERFORM public.dev4_publish_event(r.client_id,'reminder:'||r.id||':'||r.trigger_date,r.title,
     'Due '||r.trigger_date,r.recipient,'reminders',r.id);
   IF r.repeat_months>0 THEN
     n:=r.repeat_months;
     next_date:=(r.anchor_date+make_interval(months=>n))::date;
     WHILE next_date<=today LOOP
       n:=n+r.repeat_months; next_date:=(r.anchor_date+make_interval(months=>n))::date;
     END LOOP;
     UPDATE public.reminders SET trigger_date=next_date,last_sent_at=now() WHERE id=r.id;
   ELSE
     UPDATE public.reminders SET status='notified',last_sent_at=now() WHERE id=r.id;
   END IF;
   sent:=sent+1;
 END LOOP;
 RETURN sent;
END $$;

CREATE OR REPLACE FUNCTION public.dev4_claim_push()
RETURNS SETOF public.notifications LANGUAGE sql SET search_path = '' AS $$
 UPDATE public.notifications SET push_status='processing',push_lease_until=now()+interval '5 minutes',
   push_lease_token=gen_random_uuid(),push_attempts=push_attempts+1
 WHERE id IN (
   SELECT n.id FROM public.notifications n WHERE n.recipient_user_id IS NOT NULL
   AND (n.push_status='pending' OR (n.push_status='processing' AND n.push_lease_until<now()))
   AND n.push_attempts<3 AND EXISTS(SELECT 1 FROM public.push_subscriptions s WHERE s.user_id=n.recipient_user_id)
   ORDER BY n.created_at LIMIT 20 FOR UPDATE SKIP LOCKED
 ) RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.dev4_publish_event(uuid,text,text,text,text,text,uuid), public.dev4_send_message(uuid,uuid,text,text,text), public.dev4_run_reminders(), public.dev4_claim_push() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dev4_publish_event(uuid,text,text,text,text,text,uuid), public.dev4_send_message(uuid,uuid,text,text,text), public.dev4_run_reminders(), public.dev4_claim_push() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
