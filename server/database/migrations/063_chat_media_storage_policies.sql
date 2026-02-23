-- =====================================================
-- STORAGE POLICIES FOR chat-media BUCKET
-- Run this in your Supabase SQL Editor
-- =====================================================

-- Allow authenticated users to upload files to the chat-media bucket
-- Each file is stored under the conversation ID folder
CREATE POLICY "Authenticated users can upload chat media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'chat-media'
);

-- Allow authenticated users to read/download files from the chat-media bucket
CREATE POLICY "Authenticated users can read chat media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'chat-media'
);

-- Allow authenticated users to update their uploaded files
CREATE POLICY "Authenticated users can update chat media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'chat-media'
);

-- Allow authenticated users to delete their uploaded files
CREATE POLICY "Authenticated users can delete chat media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'chat-media'
);
