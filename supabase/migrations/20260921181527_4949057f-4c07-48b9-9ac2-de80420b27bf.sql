REVOKE ALL ON FUNCTION public.whatsapp_anexo_visivel(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_anexo_visivel(text) TO authenticated;