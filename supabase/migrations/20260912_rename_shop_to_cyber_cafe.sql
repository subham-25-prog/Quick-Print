-- ==============================================================================
-- Migration: Rename default shop and pricing branding to 'Cyber Cafe'
-- ==============================================================================

-- 1. Ensure public.shops table exists and update/insert the default shop as 'Cyber Cafe'
INSERT INTO public.shops (id, name, slug)
VALUES ('00000000-0000-4000-8000-000000000001', 'Cyber Cafe', 'cyber-cafe')
ON CONFLICT (id) DO UPDATE
SET name = 'Cyber Cafe',
    slug = 'cyber-cafe',
    updated_at = now();

-- Also update any existing shop row named 'QuickPrint%' if customized with a different ID
UPDATE public.shops
SET name = 'Cyber Cafe',
    updated_at = now()
WHERE name ILIKE '%quickprint%';

-- 2. Update shop_name inside pricing JSONB in public.shop_settings
UPDATE public.shop_settings
SET pricing = jsonb_set(
    COALESCE(pricing, '{}'::jsonb),
    '{shop_name}',
    '"Cyber Cafe"'::jsonb
)
WHERE pricing IS NOT NULL;
