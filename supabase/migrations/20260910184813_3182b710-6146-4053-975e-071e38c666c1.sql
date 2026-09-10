CREATE OR REPLACE FUNCTION public.localizar_lead_ativo(_telefone text DEFAULT NULL, _cnpj text DEFAULT NULL)
RETURNS TABLE(lead_id uuid, owner_id uuid, stage lead_stage, company text, origem text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH chaves AS (
    SELECT public.tel_chave(_telefone) AS tel,
           NULLIF(regexp_replace(coalesce(_cnpj,''), '\D', '', 'g'), '') AS cnpj
  )
  SELECT l.id, l.owner_id, l.stage, l.company,
         CASE WHEN c.cnpj IS NOT NULL
                   AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = c.cnpj
              THEN 'lead_ativo:cnpj' ELSE 'lead_ativo:telefone' END AS origem
    FROM public.leads l, chaves c
   WHERE l.stage NOT IN ('ganho','perdido')
     AND (
       (c.cnpj IS NOT NULL AND length(c.cnpj) = 14
         AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = c.cnpj)
       OR (c.tel IS NOT NULL AND (
             public.tel_chave(l.phone) = c.tel
          OR public.tel_chave(l.telefone_whatsapp) = c.tel
          OR public.tel_chave(l.telefone_fixo) = c.tel
          OR public.tel_chave(l.whatsapp) = c.tel))
     )
   ORDER BY (CASE WHEN c.cnpj IS NOT NULL
                   AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = c.cnpj THEN 0 ELSE 1 END),
            l.last_contact_at DESC NULLS LAST,
            l.created_at ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.localizar_lead_ativo(text, text) TO authenticated, service_role;