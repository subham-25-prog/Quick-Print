-- QuickPrint Migration: Fix order deletion cascades and add atomic delete_orders RPC
-- Date: 2026-09-09

-- 1. Ensure payments.order_id is nullable and cascades on order deletion
ALTER TABLE public.payments ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_order_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- 2. Ensure print_jobs cascade on order deletion
ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_job_order_shop_fk;
ALTER TABLE public.print_jobs
  ADD CONSTRAINT print_job_order_shop_fk
  FOREIGN KEY (order_id, shop_id) REFERENCES public.orders(id, shop_id)
  ON DELETE CASCADE;

-- 3. Ensure webhook_inbox cascades on payment deletion
ALTER TABLE public.webhook_inbox DROP CONSTRAINT IF EXISTS webhook_inbox_payment_id_fkey;
ALTER TABLE public.webhook_inbox
  ADD CONSTRAINT webhook_inbox_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.payments(id)
  ON DELETE CASCADE;

-- 4. Create atomic delete_orders RPC function
CREATE OR REPLACE FUNCTION public.delete_orders(
  p_shop_id UUID,
  p_order_ids UUID[] DEFAULT NULL,
  p_scope TEXT DEFAULT 'SELECTED'
)
RETURNS TABLE (
  deleted_order_ids UUID[],
  deleted_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_ids UUID[];
  v_payment_ids UUID[];
  v_file_ids UUID[];
  v_count INT;
BEGIN
  -- Determine target orders by scope or explicit ID list
  IF p_scope = 'COMPLETED' THEN
    SELECT array_agg(id) INTO v_target_ids
    FROM public.orders
    WHERE shop_id = p_shop_id
      AND order_status IN ('PRINTED', 'REJECTED', 'CANCELLED', 'FAILED');
  ELSIF p_scope = 'ALL' THEN
    SELECT array_agg(id) INTO v_target_ids
    FROM public.orders
    WHERE shop_id = p_shop_id;
  ELSE
    SELECT array_agg(id) INTO v_target_ids
    FROM public.orders
    WHERE shop_id = p_shop_id
      AND id = ANY(p_order_ids);
  END IF;

  IF v_target_ids IS NULL OR array_length(v_target_ids, 1) IS NULL THEN
    RETURN QUERY SELECT ARRAY[]::UUID[], 0;
    RETURN;
  END IF;

  -- Collect related payment and uploaded file IDs
  SELECT array_agg(payment_id) INTO v_payment_ids
  FROM public.orders
  WHERE id = ANY(v_target_ids) AND payment_id IS NOT NULL;

  SELECT array_agg(uploaded_file_id) INTO v_file_ids
  FROM public.orders
  WHERE id = ANY(v_target_ids) AND uploaded_file_id IS NOT NULL;

  -- 1. Delete print jobs
  DELETE FROM public.print_jobs WHERE order_id = ANY(v_target_ids);

  -- 2. Delete order events
  DELETE FROM public.order_events WHERE order_id = ANY(v_target_ids);

  -- 3. Delete audit logs
  DELETE FROM public.audit_logs WHERE order_id = ANY(v_target_ids);

  -- 4. Delete webhooks associated with payments
  IF v_payment_ids IS NOT NULL AND array_length(v_payment_ids, 1) > 0 THEN
    DELETE FROM public.webhook_inbox WHERE payment_id = ANY(v_payment_ids);
  END IF;

  -- 5. Delete orders (cascading to payments if configured, otherwise unlinked)
  BEGIN
    UPDATE public.payments SET order_id = NULL WHERE order_id = ANY(v_target_ids);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  DELETE FROM public.orders WHERE id = ANY(v_target_ids);

  IF v_payment_ids IS NOT NULL AND array_length(v_payment_ids, 1) > 0 THEN
    DELETE FROM public.payments WHERE id = ANY(v_payment_ids);
  END IF;
  DELETE FROM public.payments WHERE order_id = ANY(v_target_ids);

  -- 6. Delete uploaded files records
  IF v_file_ids IS NOT NULL AND array_length(v_file_ids, 1) > 0 THEN
    DELETE FROM public.uploaded_files WHERE id = ANY(v_file_ids);
  END IF;

  v_count := array_length(v_target_ids, 1);
  RETURN QUERY SELECT v_target_ids, v_count;
END;
$$;
