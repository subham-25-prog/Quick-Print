-- Phase 1: tenant-safe foundation for QuickPrint.
-- This migration preserves all existing records by assigning them to the
-- seeded legacy shop. New installations may use a different QUICKPRINT_SHOP_ID.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.shops (id, name, slug)
VALUES ('00000000-0000-4000-8000-000000000001', 'Cyber Cafe', 'cyber-cafe')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.shop_members (
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'OPERATOR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, user_id)
);

-- Scope all existing operational tables to a shop before enabling member RLS.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shop_id UUID;
UPDATE public.orders SET shop_id = '00000000-0000-4000-8000-000000000001' WHERE shop_id IS NULL;
ALTER TABLE public.orders ALTER COLUMN shop_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.orders ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS shop_id UUID;
UPDATE public.shop_settings SET shop_id = '00000000-0000-4000-8000-000000000001' WHERE shop_id IS NULL;
ALTER TABLE public.shop_settings ALTER COLUMN shop_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.shop_settings ALTER COLUMN shop_id SET NOT NULL;
-- The old singleton primary key would collide for a second shop. Make the
-- settings row key deterministic from the shop UUID before tenant upserts.
UPDATE public.shop_settings SET id = shop_id::text WHERE id = 'default_shop';
ALTER TABLE public.shop_settings ALTER COLUMN id DROP DEFAULT;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS shop_id UUID;
UPDATE public.payments p SET shop_id = o.shop_id FROM public.orders o WHERE p.order_id = o.id AND p.shop_id IS NULL;
ALTER TABLE public.payments ALTER COLUMN shop_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.payments ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS shop_id UUID;
UPDATE public.print_jobs j SET shop_id = o.shop_id FROM public.orders o WHERE j.order_id = o.id AND j.shop_id IS NULL;
ALTER TABLE public.print_jobs ALTER COLUMN shop_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.print_jobs ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE public.order_events ADD COLUMN IF NOT EXISTS shop_id UUID;
UPDATE public.order_events e SET shop_id = o.shop_id FROM public.orders o WHERE e.order_id = o.id AND e.shop_id IS NULL;
ALTER TABLE public.order_events ALTER COLUMN shop_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.order_events ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE public.print_agents ADD COLUMN IF NOT EXISTS shop_id UUID;
ALTER TABLE public.print_agents ADD COLUMN IF NOT EXISTS device_name TEXT;
ALTER TABLE public.print_agents ADD COLUMN IF NOT EXISTS version TEXT;
UPDATE public.print_agents SET shop_id = '00000000-0000-4000-8000-000000000001' WHERE shop_id IS NULL;
UPDATE public.print_agents SET device_name = COALESCE(device_name, agent_id) WHERE device_name IS NULL;
ALTER TABLE public.print_agents ALTER COLUMN shop_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.print_agents ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE public.print_agents ALTER COLUMN device_name SET NOT NULL;

DO $$
DECLARE
  table_name TEXT;
  constraint_name TEXT;
BEGIN
  FOR table_name, constraint_name IN
    SELECT * FROM (VALUES
      ('orders', 'orders_shop_id_fkey'),
      ('shop_settings', 'shop_settings_shop_id_fkey'),
      ('payments', 'payments_shop_id_fkey'),
      ('print_jobs', 'print_jobs_shop_id_fkey'),
      ('order_events', 'order_events_shop_id_fkey'),
      ('print_agents', 'print_agents_shop_id_fkey')
    ) AS t(table_name, constraint_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = constraint_name AND conrelid = ('public.' || table_name)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE RESTRICT', table_name, constraint_name);
    END IF;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_settings_shop_id ON public.shop_settings(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop_created ON public.orders(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON public.orders(shop_id, order_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_shop_status ON public.payments(shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_jobs_shop_queue ON public.print_jobs(shop_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_order_events_shop_order ON public.order_events(shop_id, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_agents_shop_heartbeat ON public.print_agents(shop_id, last_heartbeat DESC);

CREATE TABLE IF NOT EXISTS public.printers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES public.print_agents(agent_id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  system_identifier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('ONLINE', 'OFFLINE', 'UNKNOWN', 'ERROR')),
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, system_identifier)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('CUSTOMER', 'SHOP_MEMBER', 'PRINT_AGENT', 'SYSTEM', 'PAYMENT_PROVIDER')),
  actor_id TEXT,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_shop_created ON public.audit_logs(shop_id, created_at DESC);

-- No customer/browser role can read tenant data directly. The Next.js server
-- uses the service role; authenticated shop users are limited to memberships.
CREATE OR REPLACE FUNCTION public.is_shop_member(p_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = p_shop_id AND user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_shop_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_shop_member(UUID) TO authenticated;

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_member_read_own_membership ON public.shop_members;
CREATE POLICY shop_member_read_own_membership ON public.shop_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS shop_member_read_shops ON public.shops;
CREATE POLICY shop_member_read_shops ON public.shops
  FOR SELECT TO authenticated USING (public.is_shop_member(id));

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['shop_settings', 'orders', 'payments', 'print_jobs', 'order_events', 'print_agents', 'printers', 'audit_logs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS shop_member_read_%I ON public.%I', table_name, table_name);
    EXECUTE format('CREATE POLICY shop_member_read_%I ON public.%I FOR SELECT TO authenticated USING (public.is_shop_member(shop_id))', table_name, table_name);
  END LOOP;
END $$;

-- Backend-only state guard: an unpaid order can never enter PRINTING or PRINTED.
CREATE OR REPLACE FUNCTION public.prevent_unpaid_print_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_status = 'PRINTING' THEN
    IF NEW.payment_status NOT IN ('PAID', 'VERIFIED') THEN
      RAISE EXCEPTION 'cannot print an unpaid order';
    END IF;
    IF OLD.order_status NOT IN ('CONFIRMED', 'APPROVED') THEN
      RAISE EXCEPTION 'invalid transition to PRINTING from %', OLD.order_status;
    END IF;
  END IF;
  IF NEW.order_status = 'PRINTED' AND OLD.order_status <> 'PRINTING' THEN
    RAISE EXCEPTION 'invalid transition to PRINTED from %', OLD.order_status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_prevent_unpaid_print ON public.orders;
CREATE TRIGGER orders_prevent_unpaid_print
  BEFORE UPDATE OF order_status, payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unpaid_print_transition();

-- Keep provider confirmation and queue creation in one transaction and preserve
-- the order's tenant when creating the print job.
CREATE OR REPLACE FUNCTION public.confirm_verified_payment(
  p_payment_id UUID,
  p_transaction_id TEXT,
  p_provider_payload JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id UUID;
  v_shop_id UUID;
  v_existing_transaction_id TEXT;
BEGIN
  SELECT p.order_id, o.shop_id, p.transaction_id
    INTO v_order_id, v_shop_id, v_existing_transaction_id
    FROM public.payments p JOIN public.orders o ON o.id = p.order_id
    WHERE p.id = p_payment_id FOR UPDATE OF p;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF v_existing_transaction_id IS NOT NULL AND v_existing_transaction_id <> p_transaction_id THEN
    RAISE EXCEPTION 'payment transaction mismatch';
  END IF;

  UPDATE public.payments
    SET status = 'SUCCESS', transaction_id = COALESCE(transaction_id, p_transaction_id),
        provider_payload = COALESCE(p_provider_payload, provider_payload), verified_at = COALESCE(verified_at, now())
    WHERE id = p_payment_id AND status IN ('PENDING', 'SUCCESS');
  IF NOT FOUND THEN RAISE EXCEPTION 'payment cannot be confirmed'; END IF;

  UPDATE public.orders
    SET payment_status = 'PAID', order_status = 'CONFIRMED',
        transaction_ref = COALESCE(transaction_ref, p_transaction_id), updated_at = now()
    WHERE id = v_order_id;

  INSERT INTO public.print_jobs (order_id, shop_id, status)
    VALUES (v_order_id, v_shop_id, 'PENDING')
    ON CONFLICT (order_id) DO NOTHING;
  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_next_print_job(p_agent_id TEXT)
RETURNS TABLE (job_id UUID, order_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop_id UUID;
BEGIN
  SELECT shop_id INTO v_shop_id FROM public.print_agents WHERE agent_id = p_agent_id;
  IF v_shop_id IS NULL THEN RAISE EXCEPTION 'unknown print agent'; END IF;
  RETURN QUERY
  WITH next_job AS (
    SELECT id FROM public.print_jobs
      WHERE shop_id = v_shop_id AND status IN ('PENDING', 'FAILED')
        AND (status = 'PENDING' OR attempts < 3)
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE public.print_jobs pj
    SET status = 'PRINTING', claimed_by = p_agent_id, claimed_at = now(),
        attempts = pj.attempts + 1, error_message = NULL
    FROM next_job WHERE pj.id = next_job.id
    RETURNING pj.id, pj.order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_verified_payment(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_next_print_job(TEXT) FROM PUBLIC, anon, authenticated;

-- A completion report must come from the exact registered agent that claimed
-- the job. This blocks a device belonging to another shop from updating it.
DROP FUNCTION IF EXISTS public.complete_print_job(UUID, BOOLEAN, TEXT);
CREATE OR REPLACE FUNCTION public.complete_print_job(
  p_order_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL,
  p_agent_id TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop_id UUID;
BEGIN
  IF p_agent_id IS NULL OR btrim(p_agent_id) = '' THEN
    RAISE EXCEPTION 'agent id is required';
  END IF;
  SELECT shop_id INTO v_shop_id FROM public.print_agents WHERE agent_id = p_agent_id;
  IF v_shop_id IS NULL THEN RAISE EXCEPTION 'unknown print agent'; END IF;

  UPDATE public.print_jobs
    SET status = CASE WHEN p_success THEN 'PRINTED' ELSE 'FAILED' END,
        printed_at = CASE WHEN p_success THEN now() ELSE NULL END,
        error_message = CASE WHEN p_success THEN NULL ELSE p_error_message END
    WHERE order_id = p_order_id
      AND shop_id = v_shop_id
      AND claimed_by = p_agent_id
      AND status = 'PRINTING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'print job is not claimed by this agent';
  END IF;

  IF p_success THEN
    UPDATE public.orders
      SET order_status = 'PRINTED', printed_at = now(), updated_at = now()
      WHERE id = p_order_id AND shop_id = v_shop_id AND order_status = 'PRINTING';
  ELSE
    UPDATE public.orders
      SET order_status = 'CONFIRMED', failure_reason = p_error_message, updated_at = now()
      WHERE id = p_order_id AND shop_id = v_shop_id AND order_status = 'PRINTING';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_print_job(UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

COMMIT;
