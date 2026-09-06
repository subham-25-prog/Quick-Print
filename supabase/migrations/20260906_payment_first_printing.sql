-- Payment-first, idempotent print queue. Run this in the Supabase SQL editor
-- before deploying the accompanying application code.

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'sbiepay',
  payment_reference TEXT NOT NULL UNIQUE,
  provider_link_id TEXT UNIQUE,
  payment_url TEXT,
  transaction_id TEXT UNIQUE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED')),
  provider_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_url TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_status_created ON public.payments(status, created_at DESC);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.print_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PRINTING', 'PRINTED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  printed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_queue ON public.print_jobs(status, created_at);
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- Only a signed payment-provider webhook (or a server-side cash verification path) calls
-- this RPC. The unique order_id and row locks make it idempotent.
DROP FUNCTION IF EXISTS public.confirm_verified_payment(UUID, TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.confirm_verified_payment(
  p_payment_id UUID,
  p_transaction_id TEXT,
  p_provider_payload JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id UUID;
  v_existing_transaction_id TEXT;
BEGIN
  SELECT order_id, transaction_id INTO v_order_id, v_existing_transaction_id
    FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF v_existing_transaction_id IS NOT NULL AND v_existing_transaction_id <> p_transaction_id THEN
    RAISE EXCEPTION 'payment transaction mismatch';
  END IF;

  UPDATE public.payments
    SET status = 'SUCCESS', transaction_id = COALESCE(transaction_id, p_transaction_id),
        provider_payload = COALESCE(p_provider_payload, provider_payload), verified_at = COALESCE(verified_at, now())
    WHERE id = p_payment_id
      AND status IN ('PENDING', 'SUCCESS');

  IF NOT FOUND THEN RAISE EXCEPTION 'payment cannot be confirmed'; END IF;

  UPDATE public.orders
    SET payment_status = 'PAID', order_status = 'CONFIRMED',
        transaction_ref = COALESCE(transaction_ref, p_transaction_id), updated_at = now()
    WHERE id = v_order_id;

  INSERT INTO public.print_jobs (order_id, status)
    VALUES (v_order_id, 'PENDING')
    ON CONFLICT (order_id) DO NOTHING;
  RETURN v_order_id;
END;
$$;

-- Atomically reserves exactly one confirmed job for one local agent.
DROP FUNCTION IF EXISTS public.claim_next_print_job(TEXT);
CREATE OR REPLACE FUNCTION public.claim_next_print_job(p_agent_id TEXT)
RETURNS TABLE (job_id UUID, order_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH next_job AS (
    SELECT id FROM public.print_jobs
      WHERE status IN ('PENDING', 'FAILED')
        AND (status = 'PENDING' OR attempts < 3)
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
  )
  UPDATE public.print_jobs pj
    SET status = 'PRINTING', claimed_by = p_agent_id, claimed_at = now(),
        attempts = pj.attempts + 1, error_message = NULL
    FROM next_job
    WHERE pj.id = next_job.id
    RETURNING pj.id, pj.order_id;
END;
$$;

DROP FUNCTION IF EXISTS public.complete_print_job(UUID, BOOLEAN, TEXT);
CREATE OR REPLACE FUNCTION public.complete_print_job(
  p_order_id UUID, p_success BOOLEAN, p_error_message TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.print_jobs
    SET status = CASE WHEN p_success THEN 'PRINTED' ELSE 'FAILED' END,
        printed_at = CASE WHEN p_success THEN now() ELSE NULL END,
        error_message = CASE WHEN p_success THEN NULL ELSE p_error_message END
    WHERE order_id = p_order_id AND status = 'PRINTING';
  IF p_success THEN
    UPDATE public.orders SET order_status = 'PRINTED', printed_at = now(), updated_at = now() WHERE id = p_order_id;
  ELSE
    UPDATE public.orders SET order_status = 'CONFIRMED', failure_reason = p_error_message, updated_at = now() WHERE id = p_order_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_verified_payment(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_next_print_job(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_print_job(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
