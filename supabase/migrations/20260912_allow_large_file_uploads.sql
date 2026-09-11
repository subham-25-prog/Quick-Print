-- QuickPrint Migration: Allow large file uploads (up to 100 MB)
-- Date: 2026-09-12

-- 1. Relax file_size_bytes check constraint on public.uploaded_files
ALTER TABLE public.uploaded_files DROP CONSTRAINT IF EXISTS uploaded_files_file_size_bytes_check;

ALTER TABLE public.uploaded_files
  ADD CONSTRAINT uploaded_files_file_size_bytes_check
  CHECK (file_size_bytes BETWEEN 1 AND 104857600); -- 100 MB

-- 2. Update Supabase Storage bucket limit and allowed MIME types for 'shop-documents'
UPDATE storage.buckets
SET file_size_limit = 104857600, -- 100 MB
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/octet-stream']
WHERE id = 'shop-documents';
