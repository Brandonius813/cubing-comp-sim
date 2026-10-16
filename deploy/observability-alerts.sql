BEGIN;
CREATE FUNCTION ccs_observe.configure_alerts(p_user uuid,p_key text,p_from text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN ccs_observe.config c ON lower(u.email)=lower(c.owner_email) WHERE u.id=p_user AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key)>200 OR p_key !~ '^re_[A-Za-z0-9_-]+$' OR p_from IS NULL OR length(p_from)>200 OR p_from !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN RAISE EXCEPTION 'invalid_email_configuration'; END IF;
 UPDATE ccs_observe.config SET mail_key=p_key,mail_from=p_from;
END $$;
CREATE FUNCTION public.ccs_metrics_configure_alerts(p_user uuid,p_key text,p_from text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT ccs_observe.configure_alerts(p_user,p_key,p_from) $$;
REVOKE ALL ON FUNCTION ccs_observe.configure_alerts(uuid,text,text),public.ccs_metrics_configure_alerts(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION ccs_observe.configure_alerts(uuid,text,text),public.ccs_metrics_configure_alerts(uuid,text,text) TO service_role;
COMMIT;
