-- Apply after 20260906_payment_first_printing.sql for an existing deployment.
-- New payment rows explicitly set provider = razorpay; this changes the schema
-- default as well, without touching historical payment records.
ALTER TABLE IF EXISTS public.payments
  ALTER COLUMN provider SET DEFAULT 'razorpay';
