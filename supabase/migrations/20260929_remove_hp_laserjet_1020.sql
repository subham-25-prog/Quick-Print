-- Remove the old onboarding sample printer from persisted shop state.
-- Future onboarding forms leave printer details blank for the shopkeeper to enter.

DELETE FROM public.printers
WHERE lower(btrim(name)) = 'hp laserjet 1020';

UPDATE public.shop_settings
SET
  pricing = pricing - 'selected_printer',
  updated_at = now()
WHERE lower(btrim(pricing ->> 'selected_printer')) = 'hp laserjet 1020';
