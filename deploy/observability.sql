BEGIN;
CREATE SCHEMA IF NOT EXISTS ccs_observe;
REVOKE ALL ON SCHEMA ccs_observe FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA ccs_observe TO service_role;
CREATE TABLE ccs_observe.config (id boolean PRIMARY KEY DEFAULT true CHECK(id), owner_email text NOT NULL, alert_email text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), monitor_secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex'), management_token text, mail_key text, mail_from text);
CREATE TABLE ccs_observe.visits (day date NOT NULL, visitor uuid NOT NULL, views integer NOT NULL DEFAULT 1, referrer text NOT NULL DEFAULT '', PRIMARY KEY(day,visitor));
CREATE TABLE ccs_observe.activity (day date NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, PRIMARY KEY(day,user_id));
CREATE TABLE ccs_observe.limits (bucket text NOT NULL, minute timestamptz NOT NULL, count integer NOT NULL, PRIMARY KEY(bucket,minute));
CREATE TABLE ccs_observe.events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), source text NOT NULL, code text NOT NULL, status integer, duration_ms integer);
CREATE TABLE ccs_observe.health (service text PRIMARY KEY, checked_at timestamptz NOT NULL, ok boolean NOT NULL, status integer, latency_ms integer, failures integer NOT NULL DEFAULT 0, last_alert timestamptz, mail_status text);
CREATE TABLE ccs_observe.probes (at timestamptz NOT NULL DEFAULT now(), service text NOT NULL, ok boolean NOT NULL, latency_ms integer);
CREATE INDEX ON ccs_observe.events(at);
CREATE INDEX ON ccs_observe.probes(at);
CREATE TABLE ccs_observe.signups (day date PRIMARY KEY, created integer NOT NULL DEFAULT 0, verified integer NOT NULL DEFAULT 0);
INSERT INTO ccs_observe.signups SELECT (created_at AT TIME ZONE 'America/Chicago')::date,count(*),0 FROM auth.users GROUP BY 1;
INSERT INTO ccs_observe.signups SELECT (email_confirmed_at AT TIME ZONE 'America/Chicago')::date,0,count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL GROUP BY 1 ON CONFLICT(day) DO UPDATE SET verified=excluded.verified;
CREATE FUNCTION ccs_observe.signup_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO ccs_observe.signups(day,created) VALUES((NEW.created_at AT TIME ZONE 'America/Chicago')::date,1) ON CONFLICT(day) DO UPDATE SET created=ccs_observe.signups.created+1;
 END IF;
 IF NEW.email_confirmed_at IS NOT NULL AND (TG_OP='INSERT' OR OLD.email_confirmed_at IS NULL) THEN
  INSERT INTO ccs_observe.signups(day,verified) VALUES((NEW.email_confirmed_at AT TIME ZONE 'America/Chicago')::date,1) ON CONFLICT(day) DO UPDATE SET verified=ccs_observe.signups.verified+1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ccs_observe_signups AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION ccs_observe.signup_change();
CREATE FUNCTION ccs_observe.ingest(p_kind text,p_visitor uuid,p_user uuid,p_day date,p_referrer text,p_bucket text,p_code text,p_status integer,p_duration integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; today date := (now() AT TIME ZONE 'America/Chicago')::date;
BEGIN
 INSERT INTO ccs_observe.limits VALUES(left(p_bucket,80),date_trunc('minute',now()),1) ON CONFLICT(bucket,minute) DO UPDATE SET count=ccs_observe.limits.count+1 RETURNING count INTO n;
 IF n>60 THEN RETURN false; END IF;
 IF p_day < today-7 OR p_day > today THEN RETURN false; END IF;
 IF p_kind='visit' THEN
  INSERT INTO ccs_observe.visits(day,visitor,referrer) VALUES(p_day,p_visitor,left(coalesce(p_referrer,''),160)) ON CONFLICT(day,visitor) DO UPDATE SET views=least(ccs_observe.visits.views+1,500);
 ELSIF p_kind='activity' AND p_user IS NOT NULL THEN
  INSERT INTO ccs_observe.activity VALUES(p_day,p_user) ON CONFLICT DO NOTHING;
 ELSIF p_kind='error' AND p_code IN ('local_save_failed','scramble_failed','client_error','cloud_transfer_failed') THEN
  INSERT INTO ccs_observe.events(source,code,status,duration_ms) VALUES('browser',p_code,NULL,NULL);
 ELSIF p_kind='api' AND p_code IN ('upload','download','metadata','account') THEN
  INSERT INTO ccs_observe.events(source,code,status,duration_ms) VALUES('browser-api',p_code,greatest(0,least(p_status,599)),greatest(0,least(p_duration,120000)));
 ELSE RETURN false; END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.ccs_metrics_ingest(p_kind text,p_visitor uuid,p_user uuid,p_day date,p_referrer text,p_bucket text,p_code text,p_status integer,p_duration integer) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT ccs_observe.ingest(p_kind,p_visitor,p_user,p_day,p_referrer,p_bucket,p_code,p_status,p_duration) $$;
CREATE FUNCTION ccs_observe.read_dashboard(p_user uuid,p_start date,p_end date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE output jsonb; today date := (now() AT TIME ZONE 'America/Chicago')::date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN ccs_observe.config c ON lower(u.email)=lower(c.owner_email) WHERE u.id=p_user AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'invalid_date_range'; END IF;
 SELECT jsonb_build_object(
 'generatedAt',now(),'trackingStarted',(SELECT started_at FROM ccs_observe.config),'timezone','America/Chicago',
 'visitors',(SELECT count(DISTINCT visitor) FROM ccs_observe.visits WHERE day BETWEEN p_start AND p_end),
 'pageviews',(SELECT coalesce(sum(views),0) FROM ccs_observe.visits WHERE day BETWEEN p_start AND p_end),
 'newAccounts',(SELECT coalesce(sum(created),0) FROM ccs_observe.signups WHERE day BETWEEN p_start AND p_end),
 'newVerified',(SELECT coalesce(sum(verified),0) FROM ccs_observe.signups WHERE day BETWEEN p_start AND p_end),
 'accounts',(SELECT count(*) FROM auth.users WHERE deleted_at IS NULL),
 'verifiedAccounts',(SELECT count(*) FROM auth.users WHERE deleted_at IS NULL AND email_confirmed_at IS NOT NULL),
 'activeAccounts',(SELECT count(DISTINCT user_id) FROM ccs_observe.activity WHERE day BETWEEN p_start AND p_end),
 'activeWindows',(SELECT jsonb_build_object('day',count(DISTINCT user_id) FILTER(WHERE day=today),'week',count(DISTINCT user_id) FILTER(WHERE day>=today-6),'month',count(DISTINCT user_id) FILTER(WHERE day>=today-29)) FROM ccs_observe.activity),
 'visitorWindows',(SELECT jsonb_build_object('day',count(DISTINCT visitor) FILTER(WHERE day=today),'week',count(DISTINCT visitor) FILTER(WHERE day>=today-6),'month',count(DISTINCT visitor) FILTER(WHERE day>=today-29)) FROM ccs_observe.visits),
 'daily',(SELECT coalesce(jsonb_agg(jsonb_build_object('day',d::date,'visitors',(SELECT count(*) FROM ccs_observe.visits WHERE day=d::date),'pageviews',(SELECT coalesce(sum(views),0) FROM ccs_observe.visits WHERE day=d::date),'accounts',(SELECT coalesce(sum(created),0) FROM ccs_observe.signups WHERE day=d::date),'active',(SELECT count(*) FROM ccs_observe.activity WHERE day=d::date)) ORDER BY d),'[]'::jsonb) FROM generate_series(p_start::timestamp,p_end::timestamp,'1 day') d),
 'referrers',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT coalesce(nullif(referrer,''),'Direct / unknown') AS referrer,count(DISTINCT visitor) AS visitors FROM ccs_observe.visits WHERE day BETWEEN p_start AND p_end GROUP BY 1 ORDER BY 2 DESC LIMIT 20) x),
 'cloud',(SELECT jsonb_build_object('savedAccounts',count(*),'bytes',coalesce(sum(bytes),0),'lastSave',max(saved_at)) FROM ccs_backend.cloud_saves),
 'database',jsonb_build_object('bytes',pg_database_size(current_database()),'connections',(SELECT count(*) FROM pg_stat_activity),'metricsBytes',(SELECT coalesce(sum(pg_total_relation_size(c.oid)),0) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ccs_observe' AND c.relkind='r')),
 'api',(SELECT jsonb_build_object('requests',count(*),'failures',count(*) FILTER(WHERE status=0 OR status>=400),'p95ms',percentile_cont(0.95) WITHIN GROUP(ORDER BY duration_ms)) FROM ccs_observe.events WHERE source='browser-api' AND at>=p_start::timestamp AT TIME ZONE 'America/Chicago' AND at<(p_end+1)::timestamp AT TIME ZONE 'America/Chicago'),
 'logs',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT at,source,code,status,duration_ms FROM ccs_observe.events WHERE at>=p_start::timestamp AT TIME ZONE 'America/Chicago' AND at<(p_end+1)::timestamp AT TIME ZONE 'America/Chicago' ORDER BY at DESC LIMIT 200) x),
 'health',(SELECT coalesce(jsonb_agg(h),'[]'::jsonb) FROM ccs_observe.health h),
 'uptime',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT service,count(*) AS checks,round(100.0*count(*) FILTER(WHERE ok)/greatest(count(*),1),2) AS percent FROM ccs_observe.probes WHERE at>=p_start::timestamp AT TIME ZONE 'America/Chicago' AND at<(p_end+1)::timestamp AT TIME ZONE 'America/Chicago' GROUP BY service) x),
 'alerts',(SELECT jsonb_build_object('recipient',alert_email,'mailConfigured',mail_key IS NOT NULL,'intervalMinutes',5) FROM ccs_observe.config)
 ) INTO output;
 RETURN output;
END $$;
CREATE FUNCTION public.ccs_metrics_read(p_user uuid,p_start date,p_end date) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT ccs_observe.read_dashboard(p_user,p_start,p_end) $$;
CREATE FUNCTION ccs_observe.monitor_config(p_secret text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ccs_observe.config WHERE monitor_secret=p_secret) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('recipient',alert_email,'mailKey',mail_key,'mailFrom',mail_from) FROM ccs_observe.config);
END $$;
CREATE FUNCTION public.ccs_metrics_monitor_config(p_secret text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT ccs_observe.monitor_config(p_secret) $$;
CREATE FUNCTION ccs_observe.probe(p_service text,p_ok boolean,p_status integer,p_latency integer,p_mail text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h ccs_observe.health; should_alert boolean;
BEGIN
 IF p_service NOT IN ('Website','Cloud API','Authentication') THEN RAISE EXCEPTION 'invalid_service'; END IF;
 IF p_mail IS NOT NULL THEN UPDATE ccs_observe.health SET mail_status=left(p_mail,80) WHERE service=p_service; RETURN false; END IF;
 INSERT INTO ccs_observe.health(service,checked_at,ok,status,latency_ms,failures) VALUES(p_service,now(),p_ok,p_status,p_latency,CASE WHEN p_ok THEN 0 ELSE 1 END)
 ON CONFLICT(service) DO UPDATE SET checked_at=now(),ok=p_ok,status=p_status,latency_ms=p_latency,failures=CASE WHEN p_ok THEN 0 ELSE ccs_observe.health.failures+1 END RETURNING * INTO h;
 INSERT INTO ccs_observe.probes(service,ok,latency_ms) VALUES(p_service,p_ok,p_latency);
 should_alert := NOT p_ok AND h.failures>=2 AND (h.last_alert IS NULL OR h.last_alert<now()-interval '6 hours');
 IF should_alert THEN UPDATE ccs_observe.health SET last_alert=now() WHERE service=p_service; END IF;
 IF NOT p_ok THEN INSERT INTO ccs_observe.events(source,code,status,duration_ms) VALUES('monitor',p_service,p_status,p_latency); END IF;
 RETURN should_alert;
END $$;
CREATE FUNCTION public.ccs_metrics_probe(p_service text,p_ok boolean,p_status integer,p_latency integer,p_mail text DEFAULT NULL) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT ccs_observe.probe(p_service,p_ok,p_status,p_latency,p_mail) $$;
DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='ccs_observe' LOOP EXECUTE format('ALTER TABLE ccs_observe.%I ENABLE ROW LEVEL SECURITY',t.tablename); END LOOP; END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA ccs_observe FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ccs_observe FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ccs_observe TO service_role;
REVOKE ALL ON FUNCTION public.ccs_metrics_ingest(text,uuid,uuid,date,text,text,text,integer,integer), public.ccs_metrics_read(uuid,date,date), public.ccs_metrics_monitor_config(text), public.ccs_metrics_probe(text,boolean,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ccs_metrics_ingest(text,uuid,uuid,date,text,text,text,integer,integer), public.ccs_metrics_read(uuid,date,date), public.ccs_metrics_monitor_config(text), public.ccs_metrics_probe(text,boolean,integer,integer,text) TO service_role;
COMMIT;
