-- Apply after 20260906_payment_first_printing.sql for an existing deployment.
-- Historical payment rows retain their recorded provider.
ALTER TABLE IF EXISTS public.payments
  ALTER COLUMN provider SET DEFAULT 'sbiepay';
