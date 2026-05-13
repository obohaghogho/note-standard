-- Fix infinite recursion in conversation_members with the exact policy name
DROP POLICY IF EXISTS "Members can view all conversation participants" ON conversation_members;
DROP POLICY IF EXISTS "Members can view conversation members" ON conversation_members;

-- Ensure the function exists
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv_id
    AND user_id = auth.uid()
  );
$$;

-- Apply the non-recursive policy
CREATE POLICY "Members can view all conversation participants" 
ON conversation_members FOR SELECT
USING ( public.is_conversation_member(conversation_id) );
