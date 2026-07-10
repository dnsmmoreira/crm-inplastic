
-- 1. Pesos do placar em xerife_config
ALTER TABLE public.xerife_config
  ADD COLUMN IF NOT EXISTS placar_peso_ganho int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS placar_peso_proposta int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS placar_peso_tarefa int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS placar_peso_pos_venda int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS placar_peso_sla_estourado int NOT NULL DEFAULT -5,
  ADD COLUMN IF NOT EXISTS placar_peso_carteira_60 int NOT NULL DEFAULT -3;

-- 2. Função de ranking (fonte única)
CREATE OR REPLACE FUNCTION public.placar_vendedores(_periodo text DEFAULT 'mes')
RETURNS TABLE (
  vendedor_id uuid,
  nome text,
  avatar_color text,
  ganhos_qtd bigint,
  ganhos_valor numeric,
  propostas_qtd bigint,
  conversao numeric,
  perdas_qtd bigint,
  leads_contatados bigint,
  tempo_medio_primeira_resposta_min numeric,
  slas_estourados bigint,
  carteira_45_60 bigint,
  carteira_60_mais bigint,
  pos_venda_no_prazo_pct numeric,
  score numeric,
  score_periodo_anterior numeric,
  posicao int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _sp timestamptz := _now AT TIME ZONE 'America/Sao_Paulo';
  _p_start timestamptz;
  _p_end timestamptz;
  _prev_start timestamptz;
  _prev_end timestamptz;
  _cfg record;
BEGIN
  -- Janela do período (calcula em SP e volta para UTC via subtração de intervalo)
  IF _periodo = 'semana' THEN
    _p_start := (date_trunc('week', _sp)) AT TIME ZONE 'America/Sao_Paulo';
    _p_end := _p_start + interval '7 days';
  ELSIF _periodo = 'trimestre' THEN
    _p_start := (date_trunc('quarter', _sp)) AT TIME ZONE 'America/Sao_Paulo';
    _p_end := _p_start + interval '3 months';
  ELSE
    _p_start := (date_trunc('month', _sp)) AT TIME ZONE 'America/Sao_Paulo';
    _p_end := _p_start + interval '1 month';
  END IF;

  _prev_end := _p_start;
  _prev_start := _p_start - (_p_end - _p_start);

  SELECT * INTO _cfg FROM public.xerife_config WHERE id = 1;

  RETURN QUERY
  WITH vendedores AS (
    SELECT ur.user_id AS vid
    FROM public.user_roles ur
    WHERE ur.role = 'vendedor'::app_role
  ),
  ganhos AS (
    SELECT l.owner_id AS vid, count(*)::bigint AS qtd, coalesce(sum(l.estimated_value),0) AS valor
    FROM public.leads l
    WHERE l.stage = 'ganho'
      AND l.etapa_changed_at >= _p_start AND l.etapa_changed_at < _p_end
    GROUP BY l.owner_id
  ),
  propostas AS (
    SELECT l.owner_id AS vid, count(*)::bigint AS qtd
    FROM public.leads l
    WHERE l.proposta_enviada_at >= _p_start AND l.proposta_enviada_at < _p_end
    GROUP BY l.owner_id
  ),
  perdas AS (
    SELECT l.owner_id AS vid, count(*)::bigint AS qtd
    FROM public.leads l
    WHERE l.stage = 'perdido'
      AND l.etapa_changed_at >= _p_start AND l.etapa_changed_at < _p_end
    GROUP BY l.owner_id
  ),
  contatados AS (
    SELECT t.owner_id AS vid, count(DISTINCT t.lead_id)::bigint AS qtd
    FROM public.tarefas t
    WHERE t.status = 'concluida'
      AND t.concluida_at >= _p_start AND t.concluida_at < _p_end
      AND t.lead_id IS NOT NULL
    GROUP BY t.owner_id
  ),
  tarefas_feitas AS (
    SELECT t.owner_id AS vid, count(*)::bigint AS qtd
    FROM public.tarefas t
    WHERE t.status = 'concluida'
      AND t.concluida_at >= _p_start AND t.concluida_at < _p_end
    GROUP BY t.owner_id
  ),
  primeira_resposta AS (
    SELECT l.owner_id AS vid,
           avg(EXTRACT(EPOCH FROM (fr.first_at - l.created_at)) / 60.0)::numeric AS media_min
    FROM public.leads l
    JOIN LATERAL (
      SELECT min(occurred_at) AS first_at
      FROM public.lead_interactions li
      WHERE li.lead_id = l.id
    ) fr ON TRUE
    WHERE l.created_at >= _p_start AND l.created_at < _p_end
      AND fr.first_at IS NOT NULL
    GROUP BY l.owner_id
  ),
  slas AS (
    SELECT xl.vendedor_id AS vid, count(*)::bigint AS qtd
    FROM public.xerife_log xl
    WHERE xl.regra ILIKE '%_escalado'
      AND xl.created_at >= _p_start AND xl.created_at < _p_end
    GROUP BY xl.vendedor_id
  ),
  carteira AS (
    SELECT l.owner_id AS vid,
      count(*) FILTER (
        WHERE l.last_contact_at < _now - interval '45 days'
          AND l.last_contact_at >= _now - interval '60 days'
      )::bigint AS c45_60,
      count(*) FILTER (
        WHERE l.last_contact_at < _now - interval '60 days'
      )::bigint AS c60
    FROM public.leads l
    WHERE l.stage = 'ganho'
    GROUP BY l.owner_id
  ),
  carteira_cruzou AS (
    -- leads cujo marco de 60d caiu dentro do período
    SELECT l.owner_id AS vid, count(*)::bigint AS qtd
    FROM public.leads l
    WHERE l.stage = 'ganho'
      AND l.last_contact_at IS NOT NULL
      AND (l.last_contact_at + interval '60 days') >= _p_start
      AND (l.last_contact_at + interval '60 days') <  _p_end
    GROUP BY l.owner_id
  ),
  pos_venda AS (
    SELECT t.owner_id AS vid,
      count(*)::bigint AS total,
      count(*) FILTER (WHERE t.concluida_at <= t.due_date)::bigint AS no_prazo
    FROM public.tarefas t
    WHERE t.tipo LIKE 'pos_venda_%'
      AND t.status = 'concluida'
      AND t.concluida_at >= _p_start AND t.concluida_at < _p_end
    GROUP BY t.owner_id
  ),
  -- Período anterior — só o suficiente para calcular score anterior
  ganhos_prev AS (
    SELECT l.owner_id AS vid, count(*)::bigint AS qtd FROM public.leads l
    WHERE l.stage = 'ganho' AND l.etapa_changed_at >= _prev_start AND l.etapa_changed_at < _prev_end
    GROUP BY l.owner_id
  ),
  propostas_prev AS (
    SELECT l.owner_id AS vid, count(*)::bigint AS qtd FROM public.leads l
    WHERE l.proposta_enviada_at >= _prev_start AND l.proposta_enviada_at < _prev_end
    GROUP BY l.owner_id
  ),
  tarefas_prev AS (
    SELECT t.owner_id AS vid, count(*)::bigint AS qtd FROM public.tarefas t
    WHERE t.status='concluida' AND t.concluida_at >= _prev_start AND t.concluida_at < _prev_end
    GROUP BY t.owner_id
  ),
  pos_venda_prev AS (
    SELECT t.owner_id AS vid, count(*) FILTER (WHERE t.concluida_at <= t.due_date)::bigint AS no_prazo
    FROM public.tarefas t
    WHERE t.tipo LIKE 'pos_venda_%' AND t.status='concluida'
      AND t.concluida_at >= _prev_start AND t.concluida_at < _prev_end
    GROUP BY t.owner_id
  ),
  slas_prev AS (
    SELECT xl.vendedor_id AS vid, count(*)::bigint AS qtd FROM public.xerife_log xl
    WHERE xl.regra ILIKE '%_escalado' AND xl.created_at >= _prev_start AND xl.created_at < _prev_end
    GROUP BY xl.vendedor_id
  ),
  carteira_cruzou_prev AS (
    SELECT l.owner_id AS vid, count(*)::bigint AS qtd FROM public.leads l
    WHERE l.stage='ganho' AND l.last_contact_at IS NOT NULL
      AND (l.last_contact_at + interval '60 days') >= _prev_start
      AND (l.last_contact_at + interval '60 days') <  _prev_end
    GROUP BY l.owner_id
  ),
  agg AS (
    SELECT
      v.vid,
      p.name AS nome,
      p.avatar_color,
      coalesce(g.qtd,0) AS ganhos_qtd,
      coalesce(g.valor,0) AS ganhos_valor,
      coalesce(pr.qtd,0) AS propostas_qtd,
      CASE WHEN coalesce(pr.qtd,0) = 0 THEN NULL
           ELSE round((coalesce(g.qtd,0)::numeric / pr.qtd::numeric) * 100, 1) END AS conversao,
      coalesce(pe.qtd,0) AS perdas_qtd,
      coalesce(c.qtd,0) AS leads_contatados,
      round(coalesce(fr.media_min, 0)::numeric, 1) AS tempo_medio_primeira_resposta_min,
      coalesce(s.qtd,0) AS slas_estourados,
      coalesce(ct.c45_60,0) AS carteira_45_60,
      coalesce(ct.c60,0) AS carteira_60_mais,
      CASE WHEN coalesce(pv.total,0) = 0 THEN NULL
           ELSE round((pv.no_prazo::numeric / pv.total::numeric) * 100, 1) END AS pos_venda_no_prazo_pct,
      (
        coalesce(g.qtd,0) * _cfg.placar_peso_ganho
      + coalesce(pr.qtd,0) * _cfg.placar_peso_proposta
      + coalesce(tf.qtd,0) * _cfg.placar_peso_tarefa
      + coalesce(pv.no_prazo,0) * _cfg.placar_peso_pos_venda
      + coalesce(s.qtd,0) * _cfg.placar_peso_sla_estourado
      + coalesce(cc.qtd,0) * _cfg.placar_peso_carteira_60
      )::numeric AS score,
      (
        coalesce(gp.qtd,0) * _cfg.placar_peso_ganho
      + coalesce(prp.qtd,0) * _cfg.placar_peso_proposta
      + coalesce(tp.qtd,0) * _cfg.placar_peso_tarefa
      + coalesce(pvp.no_prazo,0) * _cfg.placar_peso_pos_venda
      + coalesce(sp.qtd,0) * _cfg.placar_peso_sla_estourado
      + coalesce(ccp.qtd,0) * _cfg.placar_peso_carteira_60
      )::numeric AS score_prev
    FROM vendedores v
    LEFT JOIN public.profiles p ON p.id = v.vid
    LEFT JOIN ganhos g            ON g.vid = v.vid
    LEFT JOIN propostas pr        ON pr.vid = v.vid
    LEFT JOIN perdas pe           ON pe.vid = v.vid
    LEFT JOIN contatados c        ON c.vid = v.vid
    LEFT JOIN tarefas_feitas tf   ON tf.vid = v.vid
    LEFT JOIN primeira_resposta fr ON fr.vid = v.vid
    LEFT JOIN slas s              ON s.vid = v.vid
    LEFT JOIN carteira ct         ON ct.vid = v.vid
    LEFT JOIN carteira_cruzou cc  ON cc.vid = v.vid
    LEFT JOIN pos_venda pv        ON pv.vid = v.vid
    LEFT JOIN ganhos_prev gp      ON gp.vid = v.vid
    LEFT JOIN propostas_prev prp  ON prp.vid = v.vid
    LEFT JOIN tarefas_prev tp     ON tp.vid = v.vid
    LEFT JOIN pos_venda_prev pvp  ON pvp.vid = v.vid
    LEFT JOIN slas_prev sp        ON sp.vid = v.vid
    LEFT JOIN carteira_cruzou_prev ccp ON ccp.vid = v.vid
  )
  SELECT
    a.vid,
    coalesce(a.nome, 'Vendedor'),
    coalesce(a.avatar_color, '#2563eb'),
    a.ganhos_qtd, a.ganhos_valor, a.propostas_qtd, a.conversao, a.perdas_qtd,
    a.leads_contatados, a.tempo_medio_primeira_resposta_min, a.slas_estourados,
    a.carteira_45_60, a.carteira_60_mais, a.pos_venda_no_prazo_pct,
    a.score, a.score_prev,
    (rank() OVER (ORDER BY a.score DESC))::int AS posicao
  FROM agg a
  ORDER BY a.score DESC, a.nome ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.placar_vendedores(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.placar_vendedores(text) TO service_role;
