-- Fixes two reminder functions from 202609190010 that referenced users.client_user_id.
-- That column does not exist (a client's login is linked through users.auth_user_id), so
-- both functions failed with 42703 every time they ran: no reminder notifications were
-- ever created. Same behaviour otherwise. Safe to re-run.
BEGIN;

CREATE OR REPLACE FUNCTION public.reminders_publish_event(p_client_id uuid, p_event_key text, p_title text, p_body text, p_audience text, p_section text DEFAULT 'notifications', p_reminder_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF p_audience NOT IN ('client','adviser','both') THEN RAISE EXCEPTION 'Invalid audience'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_client_id AND role_id=1) THEN RAISE EXCEPTION 'Client not found'; END IF;
 -- Every adviser is told about every client (matches the advisor access rules).
 INSERT INTO public.notifications(client_id,title,body,recipient,advisor_id,recipient_user_id,event_key,section,related_reminder_id)
 SELECT p_client_id,p_title,p_body,'advisor',a.id,a.id,p_event_key,p_section,p_reminder_id
 FROM auth.users a WHERE a.raw_app_meta_data->>'role'='advisor' AND p_audience<>'client'
 ON CONFLICT (event_key,recipient_user_id) DO NOTHING;
 -- The client is notified only once they have a login linked to their record.
 INSERT INTO public.notifications(client_id,title,body,recipient,recipient_user_id,event_key,section,related_reminder_id)
 SELECT c.id,p_title,p_body,'client',c.auth_user_id,p_event_key,p_section,p_reminder_id
 FROM public.users c WHERE c.id=p_client_id AND p_audience<>'adviser'
 AND c.auth_user_id IS NOT NULL
 ON CONFLICT (event_key,recipient_user_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.reminders_run_reminders()
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r public.reminders; sent integer:=0; today date:=(now() AT TIME ZONE 'Africa/Johannesburg')::date; next_date date; n integer;
BEGIN
 -- Row locks prevent two server processes from delivering the same occurrence.
 FOR r IN SELECT x.* FROM public.reminders x JOIN public.reminder_rules rules ON rules.id=x.rule_id
 WHERE x.status='pending' AND x.trigger_date<=today AND rules.enabled
 ORDER BY x.trigger_date LIMIT 200 FOR UPDATE OF x SKIP LOCKED LOOP
   -- Keep an undeliverable occurrence pending until someone can receive it.
   IF NOT (
     (r.recipient<>'client' AND EXISTS(SELECT 1 FROM auth.users a WHERE a.raw_app_meta_data->>'role'='advisor'))
     OR (r.recipient<>'adviser' AND EXISTS(SELECT 1 FROM public.users c WHERE c.id=r.client_id AND c.auth_user_id IS NOT NULL))
   ) THEN CONTINUE; END IF;
   PERFORM public.reminders_publish_event(r.client_id,'reminder:'||r.id||':'||r.trigger_date,r.title,
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

-- CREATE OR REPLACE keeps existing privileges, but state them again so the file stands alone.
REVOKE ALL ON FUNCTION public.reminders_publish_event(uuid,text,text,text,text,text,uuid), public.reminders_run_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminders_publish_event(uuid,text,text,text,text,text,uuid), public.reminders_run_reminders() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
