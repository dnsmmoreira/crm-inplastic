CREATE OR REPLACE FUNCTION public.criar_transportadora_rapida(
  _nome text,
  _cnpj text DEFAULT NULL,
  _razao_social text DEFAULT NULL,
  _endereco jsonb DEFAULT NULL
)
RETURNS TABLE(id uuid, nome text, cnpj text, ativo boolean, reaproveitada boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text := btrim(coalesce(_nome, ''));
  v_cnpj_digitos text := nullif(regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g'), '');
  v_existente public.transportadoras%ROWTYPE;
  v_novo public.transportadoras%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  IF length(v_nome) < 2 THEN
    RAISE EXCEPTION 'Nome da transportadora e obrigatorio';
  END IF;

  IF v_cnpj_digitos IS NOT NULL THEN
    -- Considera ATIVAS e INATIVAS: o indice unico de CNPJ cobre todas as linhas,
    -- entao inserir de novo estouraria duplicidade. Inativa e reativada.
    SELECT t.* INTO v_existente
    FROM public.transportadoras t
    WHERE nullif(regexp_replace(coalesce(t.cnpj, ''), '\D', '', 'g'), '') = v_cnpj_digitos
    ORDER BY t.ativo DESC, t.created_at NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      IF v_existente.ativo IS DISTINCT FROM true THEN
        UPDATE public.transportadoras
           SET ativo = true
         WHERE public.transportadoras.id = v_existente.id
        RETURNING * INTO v_existente;
      END IF;
      RETURN QUERY SELECT v_existente.id, v_existente.nome, v_existente.cnpj, v_existente.ativo, true;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.transportadoras (
    nome, cnpj, razao_social, ativo,
    cep, logradouro, numero, complemento, bairro, cidade, uf, telefone, email
  )
  VALUES (
    left(v_nome, 120),
    v_cnpj_digitos,
    nullif(btrim(coalesce(_razao_social, '')), ''),
    true,
    nullif(btrim(coalesce(_endereco->>'cep', '')), ''),
    nullif(btrim(coalesce(_endereco->>'logradouro', '')), ''),
    nullif(btrim(coalesce(_endereco->>'numero', '')), ''),
    nullif(btrim(coalesce(_endereco->>'complemento', '')), ''),
    nullif(btrim(coalesce(_endereco->>'bairro', '')), ''),
    nullif(btrim(coalesce(_endereco->>'cidade', '')), ''),
    nullif(upper(btrim(coalesce(_endereco->>'uf', ''))), ''),
    nullif(btrim(coalesce(_endereco->>'telefone', '')), ''),
    nullif(btrim(coalesce(_endereco->>'email', '')), '')
  )
  RETURNING * INTO v_novo;

  RETURN QUERY SELECT v_novo.id, v_novo.nome, v_novo.cnpj, v_novo.ativo, false;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_transportadora_rapida(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_transportadora_rapida(text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.criar_transportadora_rapida(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_transportadora_rapida(text, text, text, jsonb) TO service_role;