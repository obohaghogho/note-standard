-- Add unique constraint to user_id in subscriptions table to enable upsert
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
