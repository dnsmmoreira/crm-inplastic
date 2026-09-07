import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertRpcPermissao } from "@/lib/guard-erros";

export type PlacarPeriodo = "semana" | "mes" | "trimestre";

export type PlacarVendedor = {
  vendedor_id: string;
  nome: string;
  avatar_color: string;
  ganhos_qtd: number;
  ganhos_valor: number;
  propostas_qtd: number;
  conversao: number | null;
  perdas_qtd: number;
  leads_contatados: number;
  tempo_medio_primeira_resposta_min: number;
  slas_estourados: number;
  carteira_45_60: number;
  carteira_60_mais: number;
  pos_venda_no_prazo_pct: number | null;
  /** Valor da meta mensal (null quando o caller não tem permissão de ver). */
  meta_valor: number | null;
  /** % atingido da meta (null quando período != mês OU sem meta OU sem permissão). */
  meta_pct: number | null;
  meta_batida: boolean;
  /** Faixa cruzada da meta: 0 · 50 · 80 · 100 · 120. */
  meta_faixa: number;
  /** % dos dias úteis do mês já decorridos (pace esperado). Null fora de "mês". */
  meta_pace_esperado_pct: number | null;
  /** Dias desde a última proposta enviada (null se nunca). */
  dias_sem_proposta: number | null;
  /** Limite configurado para alertar (B2B). */
  dias_sem_proposta_limite: number;
  /** Fase 2 do funil — métricas por PROPOSTA no período. */
  propostas_enviadas: number;
  conversao_proposta_pct: number | null;
  valor_recusado: number;
  score: number;
  score_periodo_anterior: number;
  posicao: number;
};

export type MetaHistoricoRow = {
  user_id: string;
  nome: string;
  avatar_color: string;
  ano: number;
  mes: number;
  meta_valor: number;
  ganhos_valor: number;
  ganhos_qtd: number;
  atingido_pct: number;
  bateu: boolean;
};

const inputSchema = z.object({
  periodo: z.enum(["semana", "mes", "trimestre"]).default("mes"),
});

/** Início do período do placar, no mesmo recorte usado pela RPC. */
function inicioDoPeriodo(periodo: PlacarPeriodo): string {
  const hoje = new Date();
  if (periodo === "semana") {
    const d = new Date(hoje);
    const diaSemana = (d.getDay() + 6) % 7; // segunda = 0
    d.setDate(d.getDate() - diaSemana);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (periodo === "trimestre") {
    const tri = Math.floor(hoje.getMonth() / 3) * 3;
    return new Date(hoje.getFullYear(), tri, 1).toISOString();
  }
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
}

/** Fonte única do Placar. Meta é filtrada por role: admin vê todas, vendedor só a própria. */
export const getPlacar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [rankRes, roleRes] = await Promise.all([
      supabase.rpc("placar_vendedores" as any, { _periodo: data.periodo }),
      supabase.rpc("has_role" as any, { _user_id: userId, _role: "admin" }),
    ]);
    if (rankRes.error) throw new Error(rankRes.error.message);
    const isAdmin =
      (await assertRpcPermissao(roleRes, "placar.getPlacar/has_role", { userId })) === true;

    const vendedores = ((rankRes.data ?? []) as any[]).map((r) => {
      const isSelf = r.vendedor_id === userId;
      const canSeeMeta = isAdmin || isSelf;
      return {
        vendedor_id: r.vendedor_id,
        nome: r.nome,
        avatar_color: r.avatar_color,
        ganhos_qtd: Number(r.ganhos_qtd ?? 0),
        ganhos_valor: Number(r.ganhos_valor ?? 0),
        propostas_qtd: Number(r.propostas_qtd ?? 0),
        conversao: r.conversao == null ? null : Number(r.conversao),
        perdas_qtd: Number(r.perdas_qtd ?? 0),
        leads_contatados: Number(r.leads_contatados ?? 0),
        tempo_medio_primeira_resposta_min: Number(r.tempo_medio_primeira_resposta_min ?? 0),
        slas_estourados: Number(r.slas_estourados ?? 0),
        carteira_45_60: Number(r.carteira_45_60 ?? 0),
        carteira_60_mais: Number(r.carteira_60_mais ?? 0),
        pos_venda_no_prazo_pct:
          r.pos_venda_no_prazo_pct == null ? null : Number(r.pos_venda_no_prazo_pct),
        meta_valor: canSeeMeta ? (r.meta_valor == null ? 0 : Number(r.meta_valor)) : null,
        meta_pct: canSeeMeta && r.meta_pct != null ? Number(r.meta_pct) : null,
        meta_batida: Boolean(r.meta_batida),
        meta_faixa: Number(r.meta_faixa ?? 0),
        meta_pace_esperado_pct:
          r.meta_pace_esperado_pct == null ? null : Number(r.meta_pace_esperado_pct),
        dias_sem_proposta: r.dias_sem_proposta == null ? null : Number(r.dias_sem_proposta),
        dias_sem_proposta_limite: Number(r.dias_sem_proposta_limite ?? 14),
        propostas_enviadas: 0,
        conversao_proposta_pct: null,
        valor_recusado: 0,
        score: Number(r.score ?? 0),
        score_periodo_anterior: Number(r.score_periodo_anterior ?? 0),
        posicao: Number(r.posicao ?? 0),
      } as PlacarVendedor;
    });

    // Métricas por proposta (enviadas, conversão e valor recusado) no mesmo período.
    try {
      const inicio = inicioDoPeriodo(data.periodo);
      const propRes = await supabase
        .from("propostas")
        .select("id, owner_id, status, sent_at, discount_percent, acrescimo_percent")
        .gte("created_at", inicio);
      if (!propRes.error) {
        const props = propRes.data ?? [];
        const ids = props.map((p) => p.id);
        const subtotais = new Map<string, number>();
        if (ids.length > 0) {
          const itensRes = await supabase
            .from("proposta_itens")
            .select("proposta_id, quantity, unit_price")
            .in("proposta_id", ids);
          for (const it of itensRes.data ?? []) {
            subtotais.set(
              it.proposta_id,
              (subtotais.get(it.proposta_id) ?? 0) +
                Number(it.quantity ?? 0) * Number(it.unit_price ?? 0),
            );
          }
        }
        const agg = new Map<string, { enviadas: number; pedido: number; recusada: number; valorRecusado: number }>();
        for (const p of props) {
          const cur = agg.get(p.owner_id) ?? { enviadas: 0, pedido: 0, recusada: 0, valorRecusado: 0 };
          if (p.sent_at) cur.enviadas += 1;
          if (p.status === "pedido") cur.pedido += 1;
          if (p.status === "recusada") {
            cur.recusada += 1;
            const sub = subtotais.get(p.id) ?? 0;
            const desc = Math.max(0, Math.min(100, Number(p.discount_percent) || 0));
            const acre = Math.max(0, Number(p.acrescimo_percent) || 0);
            cur.valorRecusado += +(sub * (1 - desc / 100) * (1 + acre / 100)).toFixed(2);
          }
          agg.set(p.owner_id, cur);
        }
        for (const v of vendedores) {
          const a = agg.get(v.vendedor_id);
          if (!a) continue;
          v.propostas_enviadas = a.enviadas;
          v.valor_recusado = a.valorRecusado;
          const decididas = a.pedido + a.recusada;
          v.conversao_proposta_pct = decididas > 0 ? (a.pedido / decididas) * 100 : null;
        }
      }
    } catch (e) {
      // Métrica complementar: nunca derruba o placar.
      console.error("placar/propostas", e);
    }

    return {
      periodo: data.periodo,
      vendedores,
      atualizadoEm: new Date().toISOString(),
      callerId: userId,
      callerIsAdmin: isAdmin,
    };
  });

/** Admin: lista todas as metas para edição. */
export const listMetas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const isAdmin = await assertRpcPermissao(
      await supabase.rpc("has_role" as any, { _user_id: userId, _role: "admin" }),
      "placar.listMetas/has_role",
      { userId },
    );
    if (!isAdmin) throw new Error("Forbidden");
    const { data: metas, error } = await supabase
      .from("vendedor_metas" as any)
      .select("user_id, meta_valor_mensal");
    if (error) throw new Error(error.message);
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, name, avatar_color");
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "vendedor");
    const vendedorIds = new Set((roles ?? []).map((r: any) => r.user_id));
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const metaMap = new Map(((metas ?? []) as any[]).map((m) => [m.user_id, Number(m.meta_valor_mensal)]));
    return Array.from(vendedorIds).map((id) => ({
      user_id: id as string,
      nome: (profMap.get(id as string) as any)?.name ?? "Vendedor",
      avatar_color: (profMap.get(id as string) as any)?.avatar_color ?? "#2563eb",
      meta_valor_mensal: metaMap.get(id as string) ?? 0,
    }));
  });

/** Admin: define meta mensal de um vendedor. */
export const setMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        meta_valor_mensal: z.number().min(0).max(100_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const isAdmin = await assertRpcPermissao(
      await supabase.rpc("has_role" as any, { _user_id: userId, _role: "admin" }),
      "placar.setMeta/has_role",
      { userId },
    );
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await supabase
      .from("vendedor_metas" as any)
      .upsert(
        { user_id: data.user_id, meta_valor_mensal: data.meta_valor_mensal },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Histórico mensal de metas.
 * Vendedor recebe SÓ o próprio histórico. Admin recebe todos.
 * `meses` = quantidade de meses fechados para trás (default 6).
 */
export const listMetasHistorico = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ meses: z.number().int().min(1).max(24).default(6) }).parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<MetaHistoricoRow[]> => {
    const { supabase, userId } = context;
    const isAdmin = await assertRpcPermissao(
      await supabase.rpc("has_role" as any, { _user_id: userId, _role: "admin" }),
      "placar.listMetasHistorico/has_role",
      { userId },
    );

    let q = supabase
      .from("vendedor_metas_historico" as any)
      .select("user_id, ano, mes, meta_valor, ganhos_valor, ganhos_qtd, atingido_pct, bateu")
      .order("ano", { ascending: false })
      .order("mes", { ascending: false })
      .limit(data.meses * 10);
    if (!isAdmin) q = q.eq("user_id", userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.user_id)));
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, name, avatar_color")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return ((rows ?? []) as any[]).map((r) => ({
      user_id: r.user_id,
      nome: (pmap.get(r.user_id) as any)?.name ?? "Vendedor",
      avatar_color: (pmap.get(r.user_id) as any)?.avatar_color ?? "#2563eb",
      ano: Number(r.ano),
      mes: Number(r.mes),
      meta_valor: Number(r.meta_valor),
      ganhos_valor: Number(r.ganhos_valor),
      ganhos_qtd: Number(r.ganhos_qtd),
      atingido_pct: Number(r.atingido_pct),
      bateu: Boolean(r.bateu),
    }));
  });

/** Admin: snapshot manual de um mês (ex.: recalcular). */
export const snapshotMes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ ano: z.number().int(), mes: z.number().int().min(1).max(12) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const isAdmin = await assertRpcPermissao(
      await supabase.rpc("has_role" as any, { _user_id: userId, _role: "admin" }),
      "placar.snapshotMes/has_role",
      { userId },
    );
    if (!isAdmin) throw new Error("Forbidden");
    const { data: n, error } = await supabase.rpc("snapshot_metas_mes" as any, {
      _ano: data.ano,
      _mes: data.mes,
    });
    if (error) throw new Error(error.message);
    return { ok: true, linhas: Number(n ?? 0) };
  });

export type GanhoForaDoPlacar = {
  vendedor_id: string;
  nome: string;
  avatar_color: string;
  ganhos_qtd: number;
  ganhos_valor: number;
};

/** Vendas de quem NÃO participa do Placar (não entram no ranking). Somente admin. */
export const getGanhosForaDoPlacar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<GanhoForaDoPlacar[]> => {
    const { supabase, userId } = context;
    const isAdmin = await assertRpcPermissao(
      await supabase.rpc("has_role" as any, { _user_id: userId, _role: "admin" }),
      "placar.getGanhosForaDoPlacar/has_role",
      { userId },
    );
    if (!isAdmin) return [];
    const { data: rows, error } = await supabase.rpc("ganhos_fora_do_placar" as any, {
      _periodo: data.periodo,
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((r) => ({
      vendedor_id: r.vendedor_id,
      nome: r.nome,
      avatar_color: r.avatar_color,
      ganhos_qtd: Number(r.ganhos_qtd ?? 0),
      ganhos_valor: Number(r.ganhos_valor ?? 0),
    }));
  });
