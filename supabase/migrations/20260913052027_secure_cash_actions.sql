-- Apply before deploying the web route. No existing orders are deleted.
CREATE OR REPLACE FUNCTION public.resolve_cash_payment(
  p_shop_id UUID, p_reference UUID, p_action TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.payments;
  v_payment_id UUID;
  v_order_id UUID;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('ACCEPT', 'REJECT') THEN
    RAISE EXCEPTION 'invalid cash action';
  END IF;
  -- The UI can send either a pending payment ID or its resulting order ID.
  SELECT id INTO v_payment_id FROM public.payments WHERE id=p_reference AND shop_id=p_shop_id;
  IF v_payment_id IS NULL THEN
    SELECT payment_id INTO v_payment_id FROM public.orders WHERE id=p_reference AND shop_id=p_shop_id;
  END IF;
  SELECT * INTO p FROM public.payments WHERE id=v_payment_id AND shop_id=p_shop_id FOR UPDATE;
  IF p.id IS NULL OR p.provider IS DISTINCT FROM 'cash'
     OR p.merchant_id IS DISTINCT FROM 'cash' OR p.credential_fingerprint IS DISTINCT FROM 'cash'
     OR p.currency IS DISTINCT FROM 'INR' OR p.environment NOT IN ('live','sandbox') THEN
    RAISE EXCEPTION 'cash payment required';
  END IF;
  IF p.status='SUCCESS' THEN
    IF p_action='ACCEPT' AND p.order_id IS NOT NULL THEN RETURN p.order_id; END IF;
    RAISE EXCEPTION 'accepted payment cannot be rejected';
  END IF;
  IF p.status='CANCELLED' AND p_action='REJECT' THEN RETURN NULL; END IF;
  IF p.status<>'PENDING' OR p.order_id IS NOT NULL OR p.review_required THEN
    RAISE EXCEPTION 'cash payment is not pending';
  END IF;
  IF p_action='REJECT' THEN
    UPDATE public.payments SET status='CANCELLED' WHERE id=p.id;
    INSERT INTO public.audit_logs(shop_id,actor_type,actor_id,action)
      VALUES(p_shop_id,'SHOP_MEMBER','admin','cash_rejected');
    RETURN NULL;
  END IF;
  -- The payment row stays locked throughout finalization. A stable reference
  -- makes repeated ACCEPT requests idempotent, including after a lost response.
  v_order_id := public.finalize_payment(p_shop_id,p.id,'cash','cash',p.payment_reference,
    'CASH_'||p.id::TEXT,(p.amount*100)::BIGINT,p.currency,p.environment,'cash');
  IF v_order_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.orders SET payment_method='CASH' WHERE id=v_order_id AND shop_id=p_shop_id;
  INSERT INTO public.audit_logs(shop_id,order_id,actor_type,actor_id,action)
    VALUES(p_shop_id,v_order_id,'SHOP_MEMBER','admin','cash_accepted');
  RETURN v_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_cash_payment(UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_cash_payment(UUID,UUID,TEXT) TO service_role;
