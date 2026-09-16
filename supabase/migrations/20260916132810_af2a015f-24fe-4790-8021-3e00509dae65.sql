CREATE OR REPLACE FUNCTION public.chat_supervisor_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT '376cddcd-ac8f-41bf-83ae-72f4212e3ecd'::uuid $$;