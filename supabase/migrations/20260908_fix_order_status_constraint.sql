-- ==============================================================================
-- QuickPrint Migration: Fix orders_order_status_check
-- ==============================================================================
-- Run this in your Supabase SQL Editor to allow 'CONFIRMED' orders.
-- This aligns the table check constraint with finalize_payment and claim_print_job.

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
