-- ==============================================================================
-- QuickPrint Storage Configuration (Supabase Storage)
-- Private bucket for customer documents with secure signed URL access
-- ==============================================================================

-- 1. Create the private bucket 'shop-documents'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'shop-documents',
    'shop-documents',
    false, -- Private bucket (no direct public URL browsing)
    104857600, -- 100 MB file limit
    ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 104857600,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/octet-stream'];


-- 2. Storage RLS Policies
-- The API uploads and downloads through the Supabase service role; customer documents
-- must never be directly readable or writable with the public key.
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public customer uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin access to shop documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin delete shop documents" ON storage.objects;

-- Service role bypasses storage policies for backend API & print agent signed URL generation
