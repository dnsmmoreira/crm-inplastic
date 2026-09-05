import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export const ARENA_TIPOS = [
  { id: "interno", label: "Comercial interno" },
  { id: "representante", label: "Representante" },
  { id: "licitacoes", label: "Licitações" },
  { id: "nao_comercial", label: "Não comercial" },
] as const;

export type ArenaTipoComercial = (typeof ARENA_TIPOS)[number]["id"];

export type ArenaParticipacao = {
  participaArena: boolean;
  tipoComercial: ArenaTipoComercial;
  carenciaInicio: string | null;
  carenciaMeses: number;
  faseRampa: number;
  observacao: string | null;
};

export const ARENA_PARTICIPACAO_PADRAO: ArenaParticipacao = {
  participaArena: false,
  tipoComercial: "nao_comercial",
  carenciaInicio: null,
  carenciaMeses: 6,
  faseRampa: 0,
  observacao: null,
};

/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem acessar a ARENA.");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------------ */
/* Participação por usuário (admin-only)                               */
/* ------------------------------------------------------------------ */

export const getArenaParticipacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ArenaParticipacao> => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { data: row, error } = await sb
      .from("arena_participacao")
      .select("participa_arena, tipo_comercial, carencia_inicio, carencia_meses, fase_rampa, observacao")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ...ARENA_PARTICIPACAO_PADRAO };
    return {
      participaArena: row.participa_arena,
      tipoComercial: row.tipo_comercial as ArenaTipoComercial,
      carenciaInicio: row.carencia_inicio,
      carenciaMeses: Number(row.carencia_meses ?? 6),
      faseRampa: Number(row.fase_rampa ?? 0),
      observacao: row.observacao,
    };
  });

const saveSchema = z.object({
  userId: z.string().uuid(),
  participaArena: z.boolean(),
  tipoComercial: z.enum(["interno", "representante", "licitacoes", "nao_comercial"]),
  carenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  carenciaMeses: z.number().int().min(0).max(60),
  faseRampa: z.number().int().min(0).max(10),
  observacao: z.string().trim().max(500).nullable(),
});

export const saveArenaParticipacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const { data: atual, error: rErr } = await sb
      .from("arena_participacao")
      .select("participa_arena, tipo_comercial, carencia_inicio, carencia_meses, fase_rampa, observacao")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);

    const novo = {
      user_id: data.userId,
      participa_arena: data.participaArena,
      tipo_comercial: data.tipoComercial,
      carencia_inicio: data.carenciaInicio,
      carencia_meses: data.carenciaMeses,
      fase_rampa: data.faseRampa,
      observacao: data.observacao,
    };

    const { error } = await sb
      .from("arena_participacao")
      .upsert(novo, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    const campos: Array<[string, unknown, unknown]> = [
      ["arena_participa", atual?.participa_arena ?? false, data.participaArena],
      ["arena_tipo_comercial", atual?.tipo_comercial ?? "nao_comercial", data.tipoComercial],
      ["arena_carencia_inicio", atual?.carencia_inicio ?? null, data.carenciaInicio],
      ["arena_carencia_meses", atual?.carencia_meses ?? 6, data.carenciaMeses],
      ["arena_fase_rampa", atual?.fase_rampa ?? 0, data.faseRampa],
      ["arena_observacao", atual?.observacao ?? null, data.observacao],
    ];
    const rows = campos
      .filter(([, a, n]) => String(a ?? "") !== String(n ?? ""))
      .map(([campo, a, n]) => ({
        alvo_user_id: data.userId,
        ator_user_id: context.userId,
        campo: campo as string,
        valor_anterior: a === null || a === undefined ? null : String(a),
        valor_novo: n === null || n === undefined ? null : String(n),
      }));
    if (rows.length > 0) {
      const { error: aErr } = await sb.from("user_audit_log").insert(rows);
      if (aErr) console.error("[arena] auditoria falhou:", aErr.message);
    }

    return { ok: true, alteracoes: rows.length };
  });

/* ------------------------------------------------------------------ */
/* Configuração econômica (admin-only — nunca exposta a vendedor)      */
/* ------------------------------------------------------------------ */

export const getArenaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("arena_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/* ------------------------------------------------------------------ */
/* D1 — log unificado de auditoria ARENA                               */
/* ------------------------------------------------------------------ */

type AuditRow = {
  entidade: string;
  entidadeId?: string | null;
  campo: string;
  anterior: unknown;
  novo: unknown;
  motivo?: string | null;
  alvoUserId?: string | null;
};

async function registrarArenaAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  atorUserId: string,
  rows: AuditRow[],
) {
  const payload = rows
    .filter((r) => String(r.anterior ?? "") !== String(r.novo ?? ""))
    .map((r) => ({
      ator_user_id: atorUserId,
      alvo_user_id: r.alvoUserId ?? null,
      entidade: r.entidade,
      entidade_id: r.entidadeId ?? null,
      campo: r.campo,
      valor_anterior: r.anterior === null || r.anterior === undefined ? null : String(r.anterior),
      valor_novo: r.novo === null || r.novo === undefined ? null : String(r.novo),
      motivo: r.motivo?.trim() ? r.motivo.trim() : null,
    }));
  if (payload.length === 0) return 0;
  const { error } = await sb.from("arena_audit_log").insert(payload);
  if (error) console.error("[arena] auditoria falhou:", error.message);
  return payload.length;
}

export const listArenaAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ entidade: z.string().max(40).optional(), limite: z.number().int().min(1).max(500).default(200) }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    let q = sb
      .from("arena_audit_log")
      .select("id, ator_user_id, alvo_user_id, entidade, entidade_id, campo, valor_anterior, valor_novo, motivo, criado_em")
      .order("criado_em", { ascending: false })
      .limit(data.limite);
    if (data.entidade) q = q.eq("entidade", data.entidade);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(
      new Set([...(rows ?? []).map((r) => r.ator_user_id), ...(rows ?? []).map((r) => r.alvo_user_id)].filter(Boolean)),
    ) as string[];
    const nomes = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profs } = await sb.from("profiles").select("id, name").in("id", ids);
      for (const p of profs ?? []) nomes.set(p.id, p.name);
    }
    return (rows ?? []).map((r) => ({
      ...r,
      ator_nome: r.ator_user_id ? (nomes.get(r.ator_user_id) ?? "—") : "—",
      alvo_nome: r.alvo_user_id ? (nomes.get(r.alvo_user_id) ?? "—") : null,
    }));
  });

/* ------------------------------------------------------------------ */
/* B1 — configuração ARENA (leitura/gravação admin-only, com motivo)   */
/* ------------------------------------------------------------------ */

const CONFIG_NUM_FIELDS = [
  "custo_interno_teto_pct",
  "comissao_logiscal_pct",
  "comissao_kelly_pct",
  "encargos_fator",
  "margem_minima_pct",
  "piso_preco_pct",
  "arena_orcamento_mensal",
  "arena_cap_temporada",
  "carencia_meses_default",
  "meta_canal_representante",
  "temporada_meses",
  "piso_rodada_pace_pct",
  "margem_piso_comercial_pct",
  "custo_produto_pct_estimado",
  "interno_custo_fixo_mensal",
  "interno_custo_variavel_pct",
  "rep_custo_fixo_incremental_mensal",
  "rep_custo_variavel_pct",
] as const;

const configSchema = z.object({
  motivo: z.string().trim().max(300).optional(),
  patch: z
    .object({
      custo_interno_teto_pct: z.number().min(0).max(100).optional(),
      comissao_logiscal_pct: z.number().min(0).max(100).optional(),
      comissao_kelly_pct: z.number().min(0).max(100).optional(),
      encargos_fator: z.number().min(1).max(5).optional(),
      base_calculo_default: z.enum(["recebido", "faturado"]).optional(),
      base_calculo_logiscal: z.enum(["recebido", "faturado"]).optional(),
      margem_minima_pct: z.number().min(0).max(100).optional(),
      piso_preco_pct: z.number().min(0).max(100).optional(),
      arena_orcamento_mensal: z.number().min(0).optional(),
      arena_cap_temporada: z.number().min(0).optional(),
      carencia_meses_default: z.number().int().min(0).max(60).optional(),
      rampa_metas: z.array(z.number().min(0)).max(12).optional(),
      meta_canal_representante: z.number().min(0).optional(),
      arena_data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      temporada_meses: z.number().int().min(1).max(12).optional(),
      piso_rodada_ativo: z.boolean().optional(),
      piso_rodada_pace_pct: z.number().min(0).max(200).optional(),
      margem_piso_comercial_pct: z.number().min(0).max(100).optional(),
      custo_produto_pct_estimado: z.number().min(0).max(100).optional(),
      interno_custo_fixo_mensal: z.number().min(0).optional(),
      interno_custo_variavel_pct: z.number().min(0).max(100).optional(),
      rep_custo_fixo_incremental_mensal: z.number().min(0).optional(),
      rep_custo_variavel_pct: z.number().min(0).max(100).optional(),
    })
    .strict(),
});

export const saveArenaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => configSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const { data: atual, error: rErr } = await sb.from("arena_config").select("*").eq("id", 1).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!atual) throw new Error("Configuração da ARENA não encontrada.");

    const patch = data.patch as Record<string, unknown>;
    if (Object.keys(patch).length === 0) return { ok: true, alteracoes: 0 };

    const { error } = await sb
      .from("arena_config")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", 1);
    if (error) throw new Error(error.message);

    const rows: AuditRow[] = Object.entries(patch).map(([campo, novo]) => ({
      entidade: "arena_config",
      entidadeId: "1",
      campo,
      anterior: Array.isArray((atual as Record<string, unknown>)[campo])
        ? JSON.stringify((atual as Record<string, unknown>)[campo])
        : (atual as Record<string, unknown>)[campo],
      novo: Array.isArray(novo) ? JSON.stringify(novo) : novo,
      motivo: data.motivo ?? null,
    }));
    const n = await registrarArenaAudit(sb, context.userId, rows);
    return { ok: true, alteracoes: n };
  });

export const numericConfigFields = CONFIG_NUM_FIELDS;

/* ------------------------------------------------------------------ */
/* B2 — Gestão econômica (cards). Estado vazio quando não há lançamento */
/* ------------------------------------------------------------------ */

export type ArenaGestao = {
  ano: number;
  mes: number;
  temSalario: boolean;
  temReceita: boolean;
  custoInterno: number;
  custoInternoFormacao: number;
  custoIncrementalCanal: number;
  custoConsolidado: number;
  receitaFaturada: number;
  receitaRecebida: number;
  baseCalculo: string;
  custoInternoPct: number | null;
  custoInternoPctSemFormacao: number | null;
  tetoPct: number;
  acimaDoTeto: boolean;
  acimaDoTetoPorFormacao: boolean;
  margemValor: number | null;
  margemPct: number | null;
  custoArenaMes: number;
  custoArenaTemporada: number;
  metaTimeValor: number;
  metaTimePct: number | null;
  emCarencia: number;
  custoFormacaoTotal: number;
  vendedoresEmRampa: Array<{ userId: string; nome: string; faseRampa: number; carenciaInicio: string | null; carenciaMeses: number }>;
};

export const getArenaGestao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ ano: z.number().int().min(2020).max(2100), mes: z.number().int().min(1).max(12) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ArenaGestao> => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const [{ data: cfg }, { data: custos }, { data: receitas }, { data: part }] = await Promise.all([
      sb.from("arena_config").select("*").eq("id", 1).maybeSingle(),
      sb.from("arena_custo_mensal").select("*").eq("ano", data.ano).eq("mes", data.mes),
      sb.from("arena_receita_mensal").select("*").eq("ano", data.ano).eq("mes", data.mes),
      sb.from("arena_participacao").select("user_id, participa_arena, tipo_comercial, carencia_inicio, carencia_meses, fase_rampa").eq("participa_arena", true),
    ]);

    const tetoPct = Number(cfg?.custo_interno_teto_pct ?? 7);
    const baseCalculo = String(cfg?.base_calculo_default ?? "recebido");

    const lc = custos ?? [];
    const lr = receitas ?? [];

    const soma = (rows: typeof lc, f: (r: (typeof lc)[number]) => boolean) =>
      rows.filter(f).reduce((s, r) => s + Number(r.valor ?? 0), 0);

    const custoIncrementalCanal = soma(lc, (r) => r.categoria === "incremental_canal" || r.canal === "representante");
    const custoInterno = soma(lc, (r) => !(r.categoria === "incremental_canal" || r.canal === "representante"));
    const custoInternoFormacao = soma(
      lc,
      (r) => r.formacao === true && !(r.categoria === "incremental_canal" || r.canal === "representante"),
    );
    const custoConsolidado = custoInterno + custoIncrementalCanal;

    const receitaFaturada = lr.reduce((s, r) => s + Number(r.valor_faturado ?? 0), 0);
    const receitaRecebida = lr.reduce((s, r) => s + Number(r.valor_recebido ?? 0), 0);
    const base = baseCalculo === "faturado" ? receitaFaturada : receitaRecebida;

    const custoInternoPct = base > 0 ? (custoInterno / base) * 100 : null;
    const custoInternoPctSemFormacao =
      base > 0 ? ((custoInterno - custoInternoFormacao) / base) * 100 : null;

    const acimaDoTeto = custoInternoPct !== null && custoInternoPct > tetoPct;
    const acimaDoTetoPorFormacao =
      acimaDoTeto && custoInternoPctSemFormacao !== null && custoInternoPctSemFormacao <= tetoPct;

    // Meta do time = soma das metas dos participantes da ARENA (sempre lida do banco)
    const userIds = (part ?? []).map((p) => p.user_id);
    let metaTimeValor = 0;
    const nomes = new Map<string, string>();
    if (userIds.length > 0) {
      const [{ data: metas }, { data: profs }] = await Promise.all([
        sb.from("vendedor_metas").select("user_id, meta_valor_mensal").in("user_id", userIds),
        sb.from("profiles").select("id, name").in("id", userIds),
      ]);
      metaTimeValor = (metas ?? []).reduce((s, m) => s + Number(m.meta_valor_mensal ?? 0), 0);
      for (const p of profs ?? []) nomes.set(p.id, p.name);
    }

    const hoje = new Date();
    const emRampa = (part ?? []).filter((p) => {
      if (!p.carencia_inicio) return false;
      const [y, m, d] = String(p.carencia_inicio).split("-").map(Number);
      const fim = new Date(Date.UTC(y, m - 1 + Number(p.carencia_meses ?? 6), d));
      return hoje < fim;
    });

    const margemValor = base > 0 ? base - custoConsolidado : null;
    const margemPct = base > 0 ? ((base - custoConsolidado) / base) * 100 : null;

    const custoArenaMes = Number(cfg?.arena_orcamento_mensal ?? 0);
    const custoArenaTemporada = custoArenaMes * Number(cfg?.temporada_meses ?? 3);

    return {
      ano: data.ano,
      mes: data.mes,
      temSalario: lc.length > 0,
      temReceita: lr.length > 0,
      custoInterno,
      custoInternoFormacao,
      custoIncrementalCanal,
      custoConsolidado,
      receitaFaturada,
      receitaRecebida,
      baseCalculo,
      custoInternoPct,
      custoInternoPctSemFormacao,
      tetoPct,
      acimaDoTeto,
      acimaDoTetoPorFormacao,
      margemValor,
      margemPct,
      custoArenaMes,
      custoArenaTemporada,
      metaTimeValor,
      metaTimePct: metaTimeValor > 0 ? (base / metaTimeValor) * 100 : null,
      emCarencia: emRampa.length,
      custoFormacaoTotal: custoInternoFormacao,
      vendedoresEmRampa: emRampa.map((p) => ({
        userId: p.user_id,
        nome: nomes.get(p.user_id) ?? "—",
        faseRampa: Number(p.fase_rampa ?? 0),
        carenciaInicio: p.carencia_inicio,
        carenciaMeses: Number(p.carencia_meses ?? 6),
      })),
    };
  });

/* Lançamentos de custo/receita (admin-only) */

export const listArenaLancamentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ ano: z.number().int(), mes: z.number().int().min(1).max(12) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const [{ data: custos }, { data: receitas }] = await Promise.all([
      sb.from("arena_custo_mensal").select("*").eq("ano", data.ano).eq("mes", data.mes).order("created_at"),
      sb.from("arena_receita_mensal").select("*").eq("ano", data.ano).eq("mes", data.mes).order("created_at"),
    ]);
    return { custos: custos ?? [], receitas: receitas ?? [] };
  });

export const saveArenaCusto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        ano: z.number().int(),
        mes: z.number().int().min(1).max(12),
        userId: z.string().uuid().nullable(),
        canal: z.enum(["interno", "representante"]),
        categoria: z.string().min(2).max(40),
        valor: z.number().min(0),
        formacao: z.boolean(),
        observacao: z.string().trim().max(300).nullable(),
        motivo: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const row = {
      ano: data.ano,
      mes: data.mes,
      user_id: data.userId,
      canal: data.canal,
      categoria: data.categoria,
      valor: data.valor,
      formacao: data.formacao,
      observacao: data.observacao,
    };
    const res = data.id
      ? await sb.from("arena_custo_mensal").update(row).eq("id", data.id).select("id").maybeSingle()
      : await sb.from("arena_custo_mensal").insert(row).select("id").maybeSingle();
    if (res.error) throw new Error(res.error.message);
    await registrarArenaAudit(sb, context.userId, [
      {
        entidade: "arena_custo_mensal",
        entidadeId: res.data?.id ?? null,
        campo: data.id ? "lancamento_editado" : "lancamento_criado",
        anterior: data.id ? "—" : null,
        novo: `${data.categoria}/${data.canal} ${data.ano}-${String(data.mes).padStart(2, "0")}: ${data.valor}`,
        motivo: data.motivo ?? null,
        alvoUserId: data.userId,
      },
    ]);
    return { ok: true, id: res.data?.id };
  });

export const deleteArenaCusto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), motivo: z.string().trim().max(300).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { error } = await sb.from("arena_custo_mensal").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await registrarArenaAudit(sb, context.userId, [
      { entidade: "arena_custo_mensal", entidadeId: data.id, campo: "lancamento_excluido", anterior: data.id, novo: null, motivo: data.motivo ?? null },
    ]);
    return { ok: true };
  });

export const saveArenaReceita = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        ano: z.number().int(),
        mes: z.number().int().min(1).max(12),
        userId: z.string().uuid().nullable(),
        canal: z.enum(["interno", "representante"]),
        valorFaturado: z.number().min(0),
        valorRecebido: z.number().min(0),
        motivo: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { error } = await sb.from("arena_receita_mensal").upsert(
      {
        ano: data.ano,
        mes: data.mes,
        user_id: data.userId,
        canal: data.canal,
        valor_faturado: data.valorFaturado,
        valor_recebido: data.valorRecebido,
      },
      { onConflict: "ano,mes,user_id,canal" },
    );
    if (error) throw new Error(error.message);
    await registrarArenaAudit(sb, context.userId, [
      {
        entidade: "arena_receita_mensal",
        campo: "receita_lancada",
        anterior: null,
        novo: `${data.ano}-${String(data.mes).padStart(2, "0")} ${data.canal}: fat ${data.valorFaturado} / rec ${data.valorRecebido}`,
        motivo: data.motivo ?? null,
        alvoUserId: data.userId,
      },
    ]);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* B3 — Kelly: dois bolsos                                             */
/* ------------------------------------------------------------------ */

export const getArenaKelly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ userId: z.string().uuid().nullable().optional(), ano: z.number().int(), mes: z.number().int().min(1).max(12) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const { data: cfg } = await sb.from("arena_config").select("*").eq("id", 1).maybeSingle();

    let userId = data.userId ?? null;
    if (!userId) {
      const { data: rep } = await sb
        .from("arena_participacao")
        .select("user_id")
        .eq("tipo_comercial", "representante")
        .eq("participa_arena", true)
        .limit(1)
        .maybeSingle();
      userId = rep?.user_id ?? null;
    }
    if (!userId) return null;

    const [{ data: prof }, { data: receitas }, { data: custos }, { data: lics }] = await Promise.all([
      sb.from("profiles").select("id, name").eq("id", userId).maybeSingle(),
      sb.from("arena_receita_mensal").select("*").eq("user_id", userId).eq("ano", data.ano).eq("mes", data.mes),
      sb.from("arena_custo_mensal").select("*").eq("user_id", userId).eq("ano", data.ano).eq("mes", data.mes),
      sb.from("arena_licitacoes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);

    const faturado = (receitas ?? []).reduce((s, r) => s + Number(r.valor_faturado ?? 0), 0);
    const recebido = (receitas ?? []).reduce((s, r) => s + Number(r.valor_recebido ?? 0), 0);
    const baseLogiscal = String(cfg?.base_calculo_logiscal ?? "recebido");
    const base = baseLogiscal === "faturado" ? faturado : recebido;

    const comissaoLogiscalPct = Number(cfg?.comissao_logiscal_pct ?? 5);
    const comissaoKellyPct = Number(cfg?.comissao_kelly_pct ?? 0.5);
    const referencia = Number(cfg?.meta_canal_representante ?? 150000);

    const L = lics ?? [];
    const porSituacao = (s: string) => L.filter((l) => l.situacao === s);
    const somaCampo = (rows: typeof L, campo: keyof (typeof L)[number]) =>
      rows.reduce((acc, l) => acc + Number((l[campo] as number) ?? 0), 0);

    const vitorias = L.filter((l) => ["vitoria", "empenho", "recebida"].includes(String(l.situacao)));
    const disputadas = L.filter((l) => ["pregao", "vitoria", "empenho", "recebida", "perdida"].includes(String(l.situacao)));

    const ciclos = vitorias
      .filter((l) => l.data_identificacao && l.data_homologacao)
      .map((l) => (new Date(String(l.data_homologacao)).getTime() - new Date(String(l.data_identificacao)).getTime()) / 86_400_000);

    return {
      userId,
      nome: prof?.name ?? "—",
      bolso1: {
        baseCalculo: baseLogiscal,
        faturado,
        recebido,
        base,
        referencia,
        pctReferencia: referencia > 0 ? (base / referencia) * 100 : null,
        comissaoLogiscalPct,
        comissaoKellyPct,
        comissaoLogiscalValor: base * (comissaoLogiscalPct / 100),
        comissaoKellyValor: base * (comissaoKellyPct / 100),
        custoIncremental: (custos ?? [])
          .filter((c) => c.categoria === "incremental_canal" || c.canal === "representante")
          .reduce((s, c) => s + Number(c.valor ?? 0), 0),
        temLancamento: (receitas ?? []).length > 0,
      },
      bolso2: {
        identificadas: porSituacao("identificada").length,
        habilitacoes: porSituacao("habilitacao").length,
        propostas: porSituacao("proposta").length,
        pregoes: porSituacao("pregao").length,
        vitorias: vitorias.length,
        empenhos: porSituacao("empenho").length + porSituacao("recebida").length,
        perdidas: porSituacao("perdida").length,
        valorEmpenhado: somaCampo(L, "valor_empenhado"),
        valorRecebido: somaCampo(L, "valor_recebido"),
        pipeline: somaCampo(
          L.filter((l) => !["recebida", "perdida"].includes(String(l.situacao))),
          "valor_estimado",
        ),
        valorFuturo: somaCampo(vitorias, "valor_homologado") - somaCampo(vitorias, "valor_recebido"),
        taxaSucesso: disputadas.length > 0 ? (vitorias.length / disputadas.length) * 100 : null,
        cicloMedioDias: ciclos.length > 0 ? ciclos.reduce((a, b) => a + b, 0) / ciclos.length : null,
        total: L.length,
      },
      rampa: {
        metas: (cfg?.rampa_metas as number[]) ?? [],
      },
      avisoBasesDiferentes: String(cfg?.base_calculo_default ?? "recebido") !== baseLogiscal,
      baseCalculoDefault: String(cfg?.base_calculo_default ?? "recebido"),
    };
  });

export const listArenaLicitacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid().nullable().optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    let q = sb.from("arena_licitacoes").select("*").order("created_at", { ascending: false });
    if (data.userId) q = q.eq("user_id", data.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveArenaLicitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        userId: z.string().uuid().nullable(),
        orgao: z.string().trim().min(2).max(160),
        objeto: z.string().trim().max(400),
        modalidade: z.string().trim().max(60).nullable(),
        numero: z.string().trim().max(60).nullable(),
        situacao: z.enum(["identificada", "habilitacao", "proposta", "pregao", "vitoria", "empenho", "recebida", "perdida"]),
        valorEstimado: z.number().min(0),
        valorProposto: z.number().min(0),
        valorHomologado: z.number().min(0),
        valorEmpenhado: z.number().min(0),
        valorRecebido: z.number().min(0),
        dataIdentificacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        dataPregao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        dataHomologacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        observacao: z.string().trim().max(400).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const row = {
      user_id: data.userId,
      orgao: data.orgao,
      objeto: data.objeto,
      modalidade: data.modalidade,
      numero: data.numero,
      situacao: data.situacao,
      valor_estimado: data.valorEstimado,
      valor_proposto: data.valorProposto,
      valor_homologado: data.valorHomologado,
      valor_empenhado: data.valorEmpenhado,
      valor_recebido: data.valorRecebido,
      data_identificacao: data.dataIdentificacao,
      data_pregao: data.dataPregao,
      data_homologacao: data.dataHomologacao,
      observacao: data.observacao,
    };
    const res = data.id
      ? await sb.from("arena_licitacoes").update(row).eq("id", data.id).select("id").maybeSingle()
      : await sb.from("arena_licitacoes").insert(row).select("id").maybeSingle();
    if (res.error) throw new Error(res.error.message);
    await registrarArenaAudit(sb, context.userId, [
      {
        entidade: "arena_licitacoes",
        entidadeId: res.data?.id ?? null,
        campo: data.id ? "licitacao_editada" : "licitacao_criada",
        anterior: data.id ? "—" : null,
        novo: `${data.orgao} · ${data.situacao}`,
        alvoUserId: data.userId,
      },
    ]);
    return { ok: true, id: res.data?.id };
  });

/* ------------------------------------------------------------------ */
/* B5 — ponto de equilíbrio                                            */
/* ------------------------------------------------------------------ */

export const getArenaEquilibrio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { data: cfg, error } = await sb.from("arena_config").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    const { calcularEquilibrio } = await import("@/lib/arena");
    return {
      cenarios: calcularEquilibrio({
        interno_custo_fixo_mensal: Number(cfg?.interno_custo_fixo_mensal ?? 0),
        interno_custo_variavel_pct: Number(cfg?.interno_custo_variavel_pct ?? 0),
        rep_custo_variavel_pct: Number(cfg?.rep_custo_variavel_pct ?? 0),
        rep_custo_fixo_incremental_mensal: Number(cfg?.rep_custo_fixo_incremental_mensal ?? 0),
      }),
      parametrizado:
        Number(cfg?.interno_custo_fixo_mensal ?? 0) > 0 || Number(cfg?.rep_custo_fixo_incremental_mensal ?? 0) > 0,
    };
  });

/* ------------------------------------------------------------------ */
/* C1/C2 — margem da proposta e Aprovação Extraordinária da Diretoria  */
/* ------------------------------------------------------------------ */

export const avaliarMargemProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ propostaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: prop, error } = await supabase
      .from("propostas")
      .select("id, number, discount_percent, acrescimo_percent, payment_term_id")
      .eq("id", data.propostaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!prop) throw new Error("Proposta não encontrada.");

    const sb = await admin();
    const { data: cfg } = await sb.from("arena_config").select("*").eq("id", 1).maybeSingle();
    const { calcularMargem } = await import("@/lib/arena");

    const { data: itens } = await supabase
      .from("proposta_itens")
      .select("quantity, unit_price")
      .eq("proposta_id", data.propostaId);
    const receita = (itens ?? []).reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.unit_price ?? 0), 0);

    let acrescimoPct = 0;
    if (prop.payment_term_id) {
      const { data: cond } = await supabase
        .from("condicoes_pagamento")
        .select("acrescimo_percent")
        .eq("id", prop.payment_term_id)
        .maybeSingle();
      acrescimoPct = Number(cond?.acrescimo_percent ?? 0);
    }
    if (Number(prop.acrescimo_percent ?? 0) > 0) {
      // O acréscimo gravado na proposta (cartão simulado) manda no da condição.
      acrescimoPct = Number(prop.acrescimo_percent);
    }

    const comissoesPct = Number(cfg?.comissao_logiscal_pct ?? 0) + Number(cfg?.comissao_kelly_pct ?? 0);
    const custoProdutoPct = Number(cfg?.custo_produto_pct_estimado ?? 0);
    const descontoPct = Number(prop.discount_percent ?? 0);

    const margem = calcularMargem({
      receita,
      custoProdutoPct,
      descontoPct,
      comissoesPct,
      variaveisPct: 0,
    });

    const minima = custoProdutoPct > 0
      ? Number(cfg?.margem_minima_pct ?? 0)
      : Number(cfg?.margem_piso_comercial_pct ?? 0);

    const { data: aprov } = await sb
      .from("arena_aprovacoes_extraordinarias")
      .select("id, status, motivo, aprovador_id, decidido_em, observacao")
      .eq("proposta_id", data.propostaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const abaixo = margem.margemPct < minima;
    return {
      propostaId: data.propostaId,
      receita,
      margemPct: margem.margemPct,
      margemValor: margem.margemValor,
      minimaPct: minima,
      pisoComercial: custoProdutoPct === 0,
      custoProdutoParametrizado: margem.custoProdutoParametrizado,
      descontoPct,
      comissoesPct,
      acrescimoPct,
      abaixoDoMinimo: abaixo,
      bloqueado: abaixo && aprov?.status !== "aprovada",
      aprovacao: aprov ?? null,
      solicitanteId: userId,
    };
  });

export const solicitarAprovacaoExtraordinaria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        propostaId: z.string().uuid(),
        motivo: z.string().trim().min(5).max(500),
        margemOriginalPct: z.number().nullable(),
        margemPropostaPct: z.number().nullable(),
        margemMinimaPct: z.number().nullable(),
        descontoPercent: z.number().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { error } = await sb.from("arena_aprovacoes_extraordinarias").insert({
      proposta_id: data.propostaId,
      solicitante_id: context.userId,
      motivo: data.motivo,
      margem_original_pct: data.margemOriginalPct,
      margem_proposta_pct: data.margemPropostaPct,
      margem_minima_pct: data.margemMinimaPct,
      desconto_percent: data.descontoPercent,
      status: "pendente",
    });
    if (error) throw new Error(error.message);
    await registrarArenaAudit(sb, context.userId, [
      {
        entidade: "aprovacao_extraordinaria",
        entidadeId: data.propostaId,
        campo: "solicitacao",
        anterior: null,
        novo: `margem ${data.margemPropostaPct ?? "—"}% vs mínima ${data.margemMinimaPct ?? "—"}%`,
        motivo: data.motivo,
      },
    ]);
    return { ok: true };
  });

export const listAprovacoesExtraordinarias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { data: rows, error } = await sb
      .from("arena_aprovacoes_extraordinarias")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).flatMap((r) => [r.solicitante_id, r.aprovador_id]).filter(Boolean))) as string[];
    const nomes = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profs } = await sb.from("profiles").select("id, name").in("id", ids);
      for (const p of profs ?? []) nomes.set(p.id, p.name);
    }
    const propIds = Array.from(new Set((rows ?? []).map((r) => r.proposta_id)));
    const numeros = new Map<string, string>();
    if (propIds.length > 0) {
      const { data: props } = await sb.from("propostas").select("id, number").in("id", propIds);
      for (const p of props ?? []) numeros.set(p.id, p.number);
    }
    return (rows ?? []).map((r) => ({
      ...r,
      solicitante_nome: r.solicitante_id ? (nomes.get(r.solicitante_id) ?? "—") : "—",
      aprovador_nome: r.aprovador_id ? (nomes.get(r.aprovador_id) ?? "—") : null,
      proposta_numero: numeros.get(r.proposta_id) ?? r.proposta_id.slice(0, 8),
    }));
  });

export const decidirAprovacaoExtraordinaria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        decisao: z.enum(["aprovada", "recusada"]),
        observacao: z.string().trim().max(500).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { data: atual } = await sb
      .from("arena_aprovacoes_extraordinarias")
      .select("status, proposta_id")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await sb
      .from("arena_aprovacoes_extraordinarias")
      .update({
        status: data.decisao,
        aprovador_id: context.userId,
        decidido_em: new Date().toISOString(),
        observacao: data.observacao,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await registrarArenaAudit(sb, context.userId, [
      {
        entidade: "aprovacao_extraordinaria",
        entidadeId: atual?.proposta_id ?? data.id,
        campo: "decisao",
        anterior: atual?.status ?? "pendente",
        novo: data.decisao,
        motivo: data.observacao ?? null,
      },
    ]);
    return { ok: true };
  });
