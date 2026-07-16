
CREATE OR REPLACE FUNCTION public.next_proposta_number(_year int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
  _prefix text := _year::text || '-';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('proposta_number_' || _year::text));
  SELECT COALESCE(MAX(NULLIF(substring(number FROM (char_length(_prefix) + 1)), '')::int), 0) + 1
    INTO _next
  FROM public.propostas
  WHERE number LIKE _prefix || '%'
    AND substring(number FROM (char_length(_prefix) + 1)) ~ '^\d+$';
  RETURN _prefix || lpad(_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_proposta_number(int) TO authenticated;
