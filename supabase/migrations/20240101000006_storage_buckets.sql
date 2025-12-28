-- Create storage buckets for receipts and statements
-- Files are stored in format: {user_id}/{workspace_id}/{type}/{timestamp}.{extension}

-- Create receipts bucket (private)
-- Note: Using INSERT INTO storage.buckets for compatibility
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Create statements bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('statements', 'statements', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for receipts bucket
-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can upload receipts to their workspace" ON storage.objects;
DROP POLICY IF EXISTS "Users can view receipts in their workspace" ON storage.objects;
DROP POLICY IF EXISTS "Users can update receipts in their workspace" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete receipts in their workspace" ON storage.objects;

-- Allow authenticated users to upload files to their workspace folder
CREATE POLICY "Users can upload receipts to their workspace"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = (SELECT auth.uid()::text) AND
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = (SELECT auth.uid())
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);

-- Allow authenticated users to view files in their workspace folders
CREATE POLICY "Users can view receipts in their workspace"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = (SELECT auth.uid())
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);

-- Allow authenticated users to update files in their workspace folders
CREATE POLICY "Users can update receipts in their workspace"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = (SELECT auth.uid()::text) AND
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = (SELECT auth.uid())
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);

-- Allow authenticated users to delete files in their workspace folders
CREATE POLICY "Users can delete receipts in their workspace"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = (SELECT auth.uid()::text) AND
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = (SELECT auth.uid())
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);

-- Storage policies for statements bucket
-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can upload statements to their workspace" ON storage.objects;
DROP POLICY IF EXISTS "Users can view statements in their workspace" ON storage.objects;
DROP POLICY IF EXISTS "Users can update statements in their workspace" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete statements in their workspace" ON storage.objects;

-- Allow authenticated users to upload files to their workspace folder
CREATE POLICY "Users can upload statements to their workspace"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'statements' AND
  (storage.foldername(name))[1] = (SELECT auth.uid()::text) AND
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = (SELECT auth.uid())
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);

-- Allow authenticated users to view files in their workspace folders
CREATE POLICY "Users can view statements in their workspace"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'statements' AND
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = (SELECT auth.uid())
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);

-- Allow authenticated users to update files in their workspace folders
CREATE POLICY "Users can update statements in their workspace"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'statements' AND
  (storage.foldername(name))[1] = (SELECT auth.uid()::text) AND
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = (SELECT auth.uid())
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);

-- Allow authenticated users to delete files in their workspace folders
CREATE POLICY "Users can delete statements in their workspace"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'statements' AND
  (storage.foldername(name))[1] = (SELECT auth.uid()::text) AND
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = (SELECT auth.uid())
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);
