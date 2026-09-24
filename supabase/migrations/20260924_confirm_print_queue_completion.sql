-- Do not mark a customer order PRINTED when the PDF is merely handed to the
-- Windows spooler. The agent may now report PRINTED only after it has observed
-- its new print-queue job clear.
BEGIN;

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
       (OLD.order_status='PRINTING' AND NEW.order_status IN ('SUBMITTED','PRINTED','FAILED')) OR
       (OLD.order_status='SUBMITTED' AND NEW.order_status='PRINTED')) THEN
      RAISE EXCEPTION 'invalid order transition';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.finish_print_job(
  p_shop_id UUID,p_agent_id TEXT,p_job_id UUID,p_claim_token UUID,p_outcome TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.print_jobs; BEGIN
  SELECT * INTO j FROM public.print_jobs WHERE id=p_job_id AND shop_id=p_shop_id FOR UPDATE;
  IF j.id IS NULL OR j.claimed_by IS DISTINCT FROM p_agent_id OR j.claim_token IS DISTINCT FROM p_claim_token
    OR p_outcome NOT IN ('PRINTED','SUBMITTED','FAILED','REVIEW') THEN RAISE EXCEPTION 'invalid completion'; END IF;
  IF j.status=p_outcome THEN RETURN; END IF; -- Lost HTTP response: same acknowledgement is safe.
  IF (p_outcome='FAILED' AND j.status<>'CLAIMED')
    OR (p_outcome IN ('SUBMITTED','PRINTED') AND j.status<>'PRINTING')
    OR (p_outcome='REVIEW' AND j.status NOT IN ('CLAIMED','PRINTING')) THEN
    RAISE EXCEPTION 'invalid completion transition';
  END IF;
  UPDATE public.print_jobs
    SET status=p_outcome, submitted_at=CASE WHEN p_outcome='SUBMITTED' THEN now() END
    WHERE id=j.id;
  IF p_outcome='SUBMITTED' THEN
    UPDATE public.orders SET order_status='SUBMITTED',submitted_at=now(),updated_at=now() WHERE id=j.order_id;
  ELSIF p_outcome='PRINTED' THEN
    UPDATE public.orders SET order_status='PRINTED',printed_at=now(),updated_at=now() WHERE id=j.order_id;
  END IF;
  INSERT INTO public.audit_logs(shop_id,order_id,actor_type,actor_id,action)
    VALUES(p_shop_id,j.order_id,'PRINT_AGENT',p_agent_id,'print_'||lower(p_outcome));
END $$;

REVOKE ALL ON FUNCTION public.finish_print_job(UUID,TEXT,UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_print_job(UUID,TEXT,UUID,UUID,TEXT) TO service_role;

COMMIT;
