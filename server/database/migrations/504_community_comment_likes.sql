-- ==============================================================================
-- NoteStandard Migration 504: Community Comment Likes Architecture
-- Description: Creates community_comment_likes table, indexes, RLS policies,
--              and atomic trigger for community_comments.likes_count.
-- STATUS: PROPOSED MIGRATION FILE (NOT EXECUTED - READY FOR AUTHORIZED RUN)
-- ==============================================================================

-- 1. Create community_comment_likes table
CREATE TABLE IF NOT EXISTS public.community_comment_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_community_comment_likes_comment_user UNIQUE(comment_id, user_id)
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_community_comment_likes_comment ON public.community_comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_community_comment_likes_user ON public.community_comment_likes(user_id);

-- 3. Row-Level Security
ALTER TABLE public.community_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All can read comment likes" ON public.community_comment_likes;
CREATE POLICY "All can read comment likes" 
    ON public.community_comment_likes 
    FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Users can insert own comment likes" ON public.community_comment_likes;
CREATE POLICY "Users can insert own comment likes" 
    ON public.community_comment_likes 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own comment likes" ON public.community_comment_likes;
CREATE POLICY "Users can delete own comment likes" 
    ON public.community_comment_likes 
    FOR DELETE 
    USING (auth.uid() = user_id);

-- 4. Atomic Counter Maintenance Trigger
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.community_comments
        SET likes_count = COALESCE(likes_count, 0) + 1
        WHERE id = NEW.comment_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.community_comments
        SET likes_count = GREATEST(COALESCE(likes_count, 1) - 1, 0)
        WHERE id = OLD.comment_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_likes_count ON public.community_comment_likes;
CREATE TRIGGER trg_comment_likes_count
AFTER INSERT OR DELETE ON public.community_comment_likes
FOR EACH ROW EXECUTE FUNCTION public.update_comment_likes_count();
