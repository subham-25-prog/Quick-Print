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
    52428800, -- 50 MB max file size limit
    ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/json', 'text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/json', 'text/plain', 'application/octet-stream'];


-- 2. Storage RLS Policies
-- Allow anyone (public/customer) to upload to the shop-documents bucket
CREATE POLICY "Allow public customer uploads" ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'shop-documents');

-- Allow authenticated shopkeeper admins to view and download all objects
CREATE POLICY "Allow admin access to shop documents" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'shop-documents');

CREATE POLICY "Allow admin delete shop documents" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'shop-documents');

-- Service role bypasses storage policies for backend API & print agent signed URL generation
