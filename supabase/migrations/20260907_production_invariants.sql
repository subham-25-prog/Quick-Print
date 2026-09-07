-- Apply after schema.sql, storage.sql, payment_first, switch_to_sbiepay,
-- and multishop_foundation (in that explicit order). Stop agents during upgrade.
BEGIN;

CREATE TABLE public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id),
  owner_hash TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 4194304),
  page_count INT NOT NULL CHECK (page_count BETWEEN 1 AND 1000),
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  deleted_at TIMESTAMPTZ,
  deletion_claimed_at TIMESTAMPTZ,
  UNIQUE (id, shop_id)
);

CREATE TABLE public.payment_configs (
  shop_id UUID PRIMARY KEY REFERENCES public.shops(id),
  provider TEXT NOT NULL CHECK (provider IN ('phonepe')),
  merchant_id TEXT NOT NULL,
  credential_fingerprint TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','live')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.payments ADD COLUMN uploaded_file_id UUID;
ALTER TABLE public.payments ADD COLUMN owner_hash TEXT;
ALTER TABLE public.payments ADD COLUMN request_hash TEXT;
ALTER TABLE public.payments ADD COLUMN creation_started_at TIMESTAMPTZ;
ALTER TABLE public.payments ADD COLUMN idempotency_key UUID;
ALTER TABLE public.payments ADD COLUMN merchant_id TEXT;
ALTER TABLE public.payments ADD COLUMN environment TEXT;
ALTER TABLE public.payments ADD COLUMN credential_fingerprint TEXT;
ALTER TABLE public.payments ADD COLUMN draft_order JSONB;
ALTER TABLE public.payments ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '20 minutes';
ALTER TABLE public.payments ADD COLUMN last_checked_at TIMESTAMPTZ;
ALTER TABLE public.payments ADD COLUMN reconcile_after TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.payments ADD COLUMN review_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.payments ADD CONSTRAINT payment_file_shop_fk FOREIGN KEY (uploaded_file_id, shop_id) REFERENCES public.uploaded_files(id, shop_id);
CREATE UNIQUE INDEX payments_checkout_idempotency ON public.payments(shop_id, owner_hash, idempotency_key);
CREATE UNIQUE INDEX payments_one_active_file ON public.payments(uploaded_file_id) WHERE uploaded_file_id IS NOT NULL AND status IN ('PENDING','SUCCESS');
CREATE INDEX payments_reconciliation ON public.payments(shop_id, reconcile_after) WHERE status = 'PENDING';

ALTER TABLE public.orders ADD COLUMN payment_id UUID UNIQUE REFERENCES public.payments(id);
ALTER TABLE public.orders ADD COLUMN uploaded_file_id UUID UNIQUE;
ALTER TABLE public.orders ADD CONSTRAINT order_file_shop_fk FOREIGN KEY (uploaded_file_id, shop_id) REFERENCES public.uploaded_files(id, shop_id);
ALTER TABLE public.orders ADD COLUMN submitted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX orders_id_shop ON public.orders(id, shop_id);
ALTER TABLE public.print_jobs ADD CONSTRAINT print_job_order_shop_fk FOREIGN KEY (order_id, shop_id) REFERENCES public.orders(id, shop_id);
ALTER TABLE public.print_jobs DROP CONSTRAINT print_jobs_status_check;
ALTER TABLE public.print_jobs ADD CONSTRAINT print_jobs_status_check CHECK (status IN ('PENDING','CLAIMED','PRINTING','SUBMITTED','PRINTED','FAILED','REVIEW'));
ALTER TABLE public.print_jobs ADD COLUMN claim_token UUID;
ALTER TABLE public.print_jobs ADD COLUMN lease_until TIMESTAMPTZ;
ALTER TABLE public.print_jobs ADD COLUMN submitted_at TIMESTAMPTZ;
ALTER TABLE public.print_jobs ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.print_agents ADD COLUMN mode TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('sandbox','live'));
CREATE INDEX files_retention ON public.uploaded_files(expires_at) WHERE deleted_at IS NULL;

CREATE TABLE public.webhook_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id),
  payment_id UUID NOT NULL REFERENCES public.payments(id),
  event_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE TABLE public.rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  hits INT NOT NULL
);

-- Remove any historical permissive policies from application-owned tables.
DO $$ DECLARE t TEXT; p RECORD; BEGIN
  FOREACH t IN ARRAY ARRAY['shops','shop_settings','shop_members','orders','payments','uploaded_files','print_jobs','printers','print_agents','payment_configs','audit_logs','order_events','webhook_inbox','rate_limits'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT SELECT ON public.shops, public.shop_members, public.orders, public.print_jobs, public.printers, public.print_agents, public.order_events TO authenticated;
CREATE POLICY members_own ON public.shop_members FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY shops_member ON public.shops FOR SELECT TO authenticated USING (public.is_shop_member(id));
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['orders','print_jobs','printers','print_agents','order_events'] LOOP
    EXECUTE format('CREATE POLICY member_read ON public.%I FOR SELECT TO authenticated USING (public.is_shop_member(shop_id))', t);
  END LOOP;
END $$;

-- Retire all previous queue/payment mutation contracts.
DROP FUNCTION IF EXISTS public.confirm_verified_payment(UUID,TEXT,JSONB);
DROP FUNCTION IF EXISTS public.claim_next_print_job(TEXT);
DROP FUNCTION IF EXISTS public.complete_print_job(UUID,BOOLEAN,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.complete_print_job(UUID,BOOLEAN,TEXT);
DROP TRIGGER IF EXISTS orders_prevent_unpaid_print ON public.orders;

CREATE OR REPLACE FUNCTION public.prevent_unpaid_print_transition() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
  IF NEW.order_status IN ('CONFIRMED','APPROVED','PRINTING','SUBMITTED','PRINTED') THEN
    IF NEW.payment_status <> 'PAID' OR NEW.payment_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.payments p WHERE p.id=NEW.payment_id AND p.status='SUCCESS'
        AND p.shop_id=NEW.shop_id AND p.order_id=NEW.id AND p.amount=NEW.total_amount AND p.currency=NEW.currency
    ) THEN RAISE EXCEPTION 'verified payment required'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    IF NOT ((OLD.order_status IN ('CONFIRMED','FAILED') AND NEW.order_status='PRINTING') OR
       (OLD.order_status='PRINTING' AND NEW.order_status IN ('SUBMITTED','FAILED')) OR
       (OLD.order_status='SUBMITTED' AND NEW.order_status='PRINTED')) THEN
      RAISE EXCEPTION 'invalid order transition';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_prevent_unpaid_print BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_unpaid_print_transition();

-- All inputs below come from the server's provider status API, never from a browser.
CREATE FUNCTION public.finalize_payment(
  p_shop_id UUID, p_payment_id UUID, p_provider TEXT, p_merchant_id TEXT,
  p_reference TEXT, p_transaction_id TEXT, p_amount_minor BIGINT, p_currency TEXT,
  p_environment TEXT, p_credential_fingerprint TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments; f public.uploaded_files; o public.orders; v_order_id UUID; BEGIN
  SELECT * INTO p FROM public.payments WHERE id=p_payment_id AND shop_id=p_shop_id FOR UPDATE;
  IF p.id IS NULL OR p_provider IS DISTINCT FROM p.provider OR p_merchant_id IS DISTINCT FROM p.merchant_id
     OR p_reference IS DISTINCT FROM p.payment_reference OR p_amount_minor IS DISTINCT FROM (p.amount*100)::BIGINT
     OR p_currency IS DISTINCT FROM p.currency OR p_environment IS DISTINCT FROM p.environment
     OR p_credential_fingerprint IS DISTINCT FROM p.credential_fingerprint
     OR p_transaction_id IS NULL OR length(p_transaction_id)<1 THEN RAISE EXCEPTION 'payment verification mismatch'; END IF;
  IF p.status='SUCCESS' THEN
    IF p.transaction_id IS DISTINCT FROM p_transaction_id THEN RAISE EXCEPTION 'transaction mismatch'; END IF;
    RETURN p.order_id;
  END IF;
  IF p.status NOT IN ('PENDING','FAILED','EXPIRED','CANCELLED') OR p.draft_order IS NULL THEN RAISE EXCEPTION 'payment cannot be finalized'; END IF;
  SELECT * INTO f FROM public.uploaded_files WHERE id=p.uploaded_file_id AND shop_id=p_shop_id FOR UPDATE;
  IF f.id IS NULL OR f.deleted_at IS NOT NULL OR f.deletion_claimed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.orders WHERE uploaded_file_id=f.id) THEN
    UPDATE public.payments SET review_required=true WHERE id=p.id;
    RETURN NULL; -- Late second payment or deleted file: reconcile/refund; never print twice.
  END IF;
  -- A later pending attempt must not remain payable alongside this success.
  UPDATE public.payments SET status='CANCELLED', review_required=true WHERE uploaded_file_id=f.id AND id<>p.id AND status='PENDING';
  o := jsonb_populate_record(NULL::public.orders, p.draft_order);
  IF o.total_amount IS DISTINCT FROM p.amount OR o.currency IS DISTINCT FROM p.currency THEN RAISE EXCEPTION 'draft amount mismatch'; END IF;
  v_order_id := gen_random_uuid();
  -- Deferred FK permits setting payment.order_id before inserting the paid order.
  UPDATE public.payments SET status='SUCCESS', order_id=v_order_id, transaction_id=p_transaction_id, verified_at=now() WHERE id=p.id;
  INSERT INTO public.orders (id,shop_id,order_number,payment_id,uploaded_file_id,file_name,storage_path,file_type,file_size_bytes,page_count,
    paper_size,color_mode,print_sides,copies,add_ons,per_page_rate,print_subtotal,addons_subtotal,total_amount,currency,pricing_snapshot,
    payment_method,payment_status,order_status,customer_name,customer_phone,customer_notes,transaction_ref)
  VALUES (v_order_id,p_shop_id,'QP-'||upper(substr(replace(v_order_id::TEXT,'-',''),1,16)),p.id,f.id,f.file_name,f.storage_path,'application/pdf',f.file_size_bytes,f.page_count,
    o.paper_size,o.color_mode,o.print_sides,o.copies,o.add_ons,o.per_page_rate,o.print_subtotal,o.addons_subtotal,p.amount,p.currency,o.pricing_snapshot,
    'UPI','PAID','CONFIRMED',o.customer_name,o.customer_phone,o.customer_notes,p_transaction_id);
  INSERT INTO public.print_jobs(order_id,shop_id,status,is_test) VALUES(v_order_id,p_shop_id,'PENDING',p.environment='sandbox');
  INSERT INTO public.audit_logs(shop_id,order_id,actor_type,action) VALUES(p_shop_id,v_order_id,'PAYMENT_PROVIDER','payment_verified_order_queued');
  RETURN v_order_id;
END $$;
ALTER TABLE public.payments DROP CONSTRAINT payments_order_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY(order_id) REFERENCES public.orders(id) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION public.claim_print_job(p_shop_id UUID,p_agent_id TEXT)
RETURNS SETOF public.print_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.print_jobs; a public.print_agents; BEGIN
  SELECT * INTO a FROM public.print_agents WHERE agent_id=p_agent_id AND shop_id=p_shop_id;
  IF a.agent_id IS NULL OR a.last_heartbeat < now()-interval '90 seconds' THEN RAISE EXCEPTION 'agent unavailable'; END IF;
  -- Only a claim that never reached dispatch may expire and be reissued.
  UPDATE public.print_jobs SET status='PENDING',claim_token=NULL,claimed_by=NULL WHERE shop_id=p_shop_id AND status='CLAIMED' AND lease_until<now();
  SELECT pj.* INTO j FROM public.print_jobs pj JOIN public.orders o ON o.id=pj.order_id
    JOIN public.payments p ON p.id=o.payment_id
    WHERE pj.shop_id=p_shop_id AND pj.status='PENDING' AND p.status='SUCCESS' AND o.payment_status='PAID'
      AND o.order_status IN ('CONFIRMED','FAILED') AND pj.is_test=(a.mode='sandbox')
    ORDER BY pj.created_at FOR UPDATE OF pj SKIP LOCKED LIMIT 1;
  IF j.id IS NULL THEN RETURN; END IF;
  UPDATE public.print_jobs SET status='CLAIMED',claim_token=gen_random_uuid(),claimed_by=p_agent_id,
    claimed_at=now(),lease_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=j.id RETURNING * INTO j;
  RETURN NEXT j;
END $$;

CREATE FUNCTION public.start_print_job(p_shop_id UUID,p_agent_id TEXT,p_job_id UUID,p_claim_token UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.print_jobs; BEGIN
  SELECT * INTO j FROM public.print_jobs WHERE id=p_job_id AND shop_id=p_shop_id FOR UPDATE;
  IF j.id IS NULL OR j.claimed_by IS DISTINCT FROM p_agent_id OR j.claim_token IS DISTINCT FROM p_claim_token
     OR j.status <> 'CLAIMED' OR j.lease_until < now() THEN RAISE EXCEPTION 'invalid or expired claim'; END IF;
  UPDATE public.orders SET order_status='PRINTING',updated_at=now() WHERE id=j.order_id;
  UPDATE public.print_jobs SET status='PRINTING',lease_until=NULL WHERE id=j.id;
END $$;

CREATE FUNCTION public.finish_print_job(p_shop_id UUID,p_agent_id TEXT,p_job_id UUID,p_claim_token UUID,p_outcome TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.print_jobs; BEGIN
  SELECT * INTO j FROM public.print_jobs WHERE id=p_job_id AND shop_id=p_shop_id FOR UPDATE;
  IF j.id IS NULL OR j.claimed_by IS DISTINCT FROM p_agent_id OR j.claim_token IS DISTINCT FROM p_claim_token
    OR p_outcome NOT IN ('SUBMITTED','FAILED','REVIEW') THEN RAISE EXCEPTION 'invalid completion'; END IF;
  IF j.status=p_outcome THEN RETURN; END IF; -- Lost HTTP response: same acknowledgement is safe.
  IF (p_outcome='FAILED' AND j.status<>'CLAIMED') OR (p_outcome='SUBMITTED' AND j.status<>'PRINTING')
    OR (p_outcome='REVIEW' AND j.status NOT IN ('CLAIMED','PRINTING')) THEN
    RAISE EXCEPTION 'invalid completion transition';
  END IF;
  UPDATE public.print_jobs SET status=p_outcome,submitted_at=CASE WHEN p_outcome='SUBMITTED' THEN now() END WHERE id=j.id;
  IF p_outcome='SUBMITTED' THEN
    UPDATE public.orders SET order_status='SUBMITTED',submitted_at=now(),updated_at=now() WHERE id=j.order_id;
  END IF;
  INSERT INTO public.audit_logs(shop_id,order_id,actor_type,actor_id,action) VALUES(p_shop_id,j.order_id,'PRINT_AGENT',p_agent_id,'print_'||lower(p_outcome));
END $$;

CREATE FUNCTION public.retry_safe_print(p_shop_id UUID,p_order_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
  UPDATE public.print_jobs SET status='PENDING',claim_token=NULL,claimed_by=NULL WHERE shop_id=p_shop_id AND order_id=p_order_id AND status='FAILED';
  IF NOT FOUND THEN RAISE EXCEPTION 'only pre-dispatch failures can be retried'; END IF;
END $$;

CREATE FUNCTION public.consume_rate_limit(p_key TEXT,p_limit INT,p_seconds INT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INT; BEGIN
  IF p_limit<1 OR p_seconds<1 THEN RAISE EXCEPTION 'invalid limit'; END IF;
  INSERT INTO public.rate_limits(key,window_start,hits) VALUES(p_key,now(),1)
  ON CONFLICT(key) DO UPDATE SET
    hits=CASE WHEN rate_limits.window_start<now()-make_interval(secs=>p_seconds) THEN 1 ELSE rate_limits.hits+1 END,
    window_start=CASE WHEN rate_limits.window_start<now()-make_interval(secs=>p_seconds) THEN now() ELSE rate_limits.window_start END
  RETURNING hits INTO n;
  RETURN n<=p_limit;
END $$;

-- Serialize retention with payment finalization using the same file row lock.
CREATE FUNCTION public.guard_checkout_file() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE f public.uploaded_files; BEGIN
  IF NEW.uploaded_file_id IS NULL THEN RAISE EXCEPTION 'verified upload required for checkout'; END IF;
  SELECT * INTO f FROM public.uploaded_files WHERE id=NEW.uploaded_file_id AND shop_id=NEW.shop_id FOR UPDATE;
  IF f.id IS NULL OR f.deleted_at IS NOT NULL OR f.deletion_claimed_at IS NOT NULL OR f.expires_at<now()
    OR NEW.owner_hash IS DISTINCT FROM f.owner_hash THEN RAISE EXCEPTION 'upload unavailable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER checkout_file_guard BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_checkout_file();

-- A failed Storage deletion is retried; financial/order records are preserved.
CREATE FUNCTION public.claim_retention_files(p_shop_id UUID,p_days INT)
RETURNS SETOF public.uploaded_files LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.uploaded_files; BEGIN
  IF p_days NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'invalid retention'; END IF;
  FOR f IN SELECT * FROM public.uploaded_files u WHERE u.shop_id=p_shop_id AND u.deleted_at IS NULL
    AND u.created_at < now()-make_interval(days=>p_days)
    AND NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.uploaded_file_id=u.id AND p.status='PENDING')
    AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.uploaded_file_id=u.id AND o.order_status NOT IN ('SUBMITTED','PRINTED','CANCELLED'))
    ORDER BY u.created_at FOR UPDATE OF u SKIP LOCKED LIMIT 100 LOOP
    UPDATE public.uploaded_files SET deletion_claimed_at=coalesce(deletion_claimed_at,now()) WHERE id=f.id;
    RETURN NEXT f;
  END LOOP;
END $$;

CREATE FUNCTION public.shop_dashboard_stats(p_shop_id UUID) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'today_orders',(SELECT count(*) FROM orders o JOIN payments p ON p.id=o.payment_id WHERE o.shop_id=p_shop_id AND p.environment='live' AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date),
    'today_revenue',(SELECT coalesce(sum(p.amount),0) FROM payments p WHERE p.shop_id=p_shop_id AND p.status='SUCCESS' AND p.environment='live' AND (p.verified_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date),
    'today_pages_submitted',(SELECT coalesce(sum(o.page_count*o.copies),0) FROM orders o JOIN payments p ON p.id=o.payment_id WHERE o.shop_id=p_shop_id AND p.environment='live' AND (o.submitted_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date),
    'pending_jobs',(SELECT count(*) FROM print_jobs WHERE shop_id=p_shop_id AND status IN ('PENDING','CLAIMED','PRINTING')),
    'failed_jobs',(SELECT count(*) FROM print_jobs WHERE shop_id=p_shop_id AND status='FAILED'),
    'review_jobs',(SELECT count(*) FROM print_jobs WHERE shop_id=p_shop_id AND status='REVIEW')
  );
$$;

CREATE FUNCTION public.protect_agent_shop() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
  IF NEW.shop_id IS DISTINCT FROM OLD.shop_id THEN RAISE EXCEPTION 'agent shop is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_shop_immutable BEFORE UPDATE ON public.print_agents FOR EACH ROW EXECUTE FUNCTION public.protect_agent_shop();
-- Restrictive policy also blocks previously unknown permissive Storage policies.
CREATE POLICY documents_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING (bucket_id <> 'shop-documents') WITH CHECK (bucket_id <> 'shop-documents');

DO $$ DECLARE f RECORD; BEGIN
  FOR f IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
    ('finalize_payment','claim_print_job','start_print_job','finish_print_job','retry_safe_print','consume_rate_limit','claim_retention_files','shop_dashboard_stats') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
COMMIT;
