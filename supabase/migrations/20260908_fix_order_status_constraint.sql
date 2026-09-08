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
