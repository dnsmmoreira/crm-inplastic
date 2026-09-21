
CREATE OR REPLACE FUNCTION public.whatsapp_anexo_visivel(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seg text;
  _conv public.whatsapp_conversas%ROWTYPE;
  _owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN true;
  END IF;

  _seg := split_part(_name, '/', 1);

  IF _seg ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO _conv FROM public.whatsapp_conversas c WHERE c.id = _seg::uuid;
  ELSIF _seg = 'inbound' THEN
    SELECT * INTO _conv FROM public.whatsapp_conversas c WHERE c.phone = split_part(_name, '/', 2);
  ELSE
    RETURN false;
  END IF;

  IF _conv.id IS NULL THEN
    RETURN false;
  END IF;

  SELECT l.owner_id INTO _owner FROM public.leads l WHERE l.id = _conv.lead_id;

  RETURN _conv.atribuido_para = auth.uid()
      OR _owner = auth.uid()
      OR public.whatsapp_conversa_visivel(_conv.atribuido_para, _owner)
      OR public.whatsapp_conversa_visivel_auditor(_conv.atribuido_para, _owner);
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_anexo_visivel(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_anexo_visivel(text) TO authenticated;
