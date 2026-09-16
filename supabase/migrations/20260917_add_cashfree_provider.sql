-- Update payment_configs to support Cashfree alongside PhonePe
BEGIN;

ALTER TABLE public.payment_configs DROP CONSTRAINT IF EXISTS payment_configs_provider_check;
ALTER TABLE public.payment_configs ADD CONSTRAINT payment_configs_provider_check CHECK (provider IN ('phonepe', 'cashfree'));

COMMIT;
