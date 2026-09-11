-- ==============================================================================
-- QuickPrint Migration: Fix orders check constraints
-- ==============================================================================
-- Run this in your Supabase SQL Editor.
-- This aligns table check constraints with finalize_payment and claim_print_job.

-- 1. Order status check
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_order_status_check 
  CHECK (order_status IN (
    'PENDING_PAYMENT',
    'PAYMENT_VERIFICATION_PENDING',
    'CONFIRMED',
    'APPROVED',
    'PRINTING',
    'SUBMITTED',
    'PRINTED',
    'REJECTED',
    'CANCELLED',
    'FAILED'
  ));

-- 2. Payment status check (allows 'PAID' from finalize_payment)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
  CHECK (payment_status IN (
    'PENDING',
    'AWAITING_VERIFICATION',
    'PAID',
    'VERIFIED',
    'REJECTED',
    'FAILED'
  ));

-- 3. Payment method check (allows 'UPI' and 'CASH')
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check 
  CHECK (payment_method IN ('UPI', 'CASH'));

-- 4. Allow cash payment verification transition in prevent_unpaid_print_transition
CREATE OR REPLACE FUNCTION public.prevent_unpaid_print_transition() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
  IF NEW.order_status IN ('CONFIRMED','APPROVED','PRINTING','SUBMITTED','PRINTED') THEN
    IF NEW.payment_status NOT IN ('PAID','VERIFIED') OR NEW.payment_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.payments p WHERE p.id=NEW.payment_id AND p.status='SUCCESS'
        AND p.shop_id=NEW.shop_id AND p.order_id=NEW.id AND p.amount=NEW.total_amount AND p.currency=NEW.currency
    ) THEN RAISE EXCEPTION 'verified payment required'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    IF NOT ((OLD.order_status IN ('CONFIRMED','FAILED') AND NEW.order_status='PRINTING') OR
       (OLD.order_status IN ('PAYMENT_VERIFICATION_PENDING','PENDING_PAYMENT') AND NEW.order_status IN ('CONFIRMED','APPROVED','REJECTED','CANCELLED')) OR
       (OLD.order_status='PRINTING' AND NEW.order_status IN ('SUBMITTED','FAILED')) OR
       (OLD.order_status='SUBMITTED' AND NEW.order_status='PRINTED')) THEN
      RAISE EXCEPTION 'invalid order transition';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 5. Atomic RPCs for cash order verification and rejection
CREATE OR REPLACE FUNCTION public.verify_cash_order(p_shop_id UUID, p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND shop_id=p_shop_id FOR UPDATE;
  IF o.id IS NULL OR o.payment_method <> 'CASH' OR o.order_status NOT IN ('PAYMENT_VERIFICATION_PENDING','PENDING_PAYMENT') THEN
    RAISE EXCEPTION 'invalid cash order state';
  END IF;

  UPDATE public.payments SET status='SUCCESS', verified_at=now(), transaction_id='CASH_'||upper(substr(replace(p_order_id::TEXT,'-',''),1,12))
    WHERE id=o.payment_id AND shop_id=p_shop_id;

  UPDATE public.orders SET payment_status='PAID', order_status='CONFIRMED', updated_at=now()
    WHERE id=p_order_id AND shop_id=p_shop_id;

  INSERT INTO public.print_jobs(order_id, shop_id, status, is_test)
    VALUES(p_order_id, p_shop_id, 'PENDING', false);

  INSERT INTO public.audit_logs(shop_id, order_id, actor_type, action)
    VALUES(p_shop_id, p_order_id, 'SHOP_ADMIN', 'cash_verified_and_queued');
END $$;

CREATE OR REPLACE FUNCTION public.reject_cash_order(p_shop_id UUID, p_order_id UUID, p_reason TEXT DEFAULT 'Payment declined by counter')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND shop_id=p_shop_id FOR UPDATE;
  IF o.id IS NULL OR o.order_status NOT IN ('PAYMENT_VERIFICATION_PENDING','PENDING_PAYMENT') THEN
    RAISE EXCEPTION 'invalid cash order state';
  END IF;

  IF o.payment_id IS NOT NULL THEN
    UPDATE public.payments SET status='CANCELLED' WHERE id=o.payment_id AND shop_id=p_shop_id;
  END IF;

  UPDATE public.orders SET payment_status='REJECTED', order_status='REJECTED', updated_at=now()
    WHERE id=p_order_id AND shop_id=p_shop_id;

  INSERT INTO public.audit_logs(shop_id, order_id, actor_type, action)
    VALUES(p_shop_id, p_order_id, 'SHOP_ADMIN', 'cash_rejected');
END $$;

