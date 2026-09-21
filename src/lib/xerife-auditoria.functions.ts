import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertRpcPermissao, registrarFalhaSegura } from "@/lib/guard-erros";

/**
 * Auditoria do Xerife — o "Xerife Humano".
 *
 * Leitura pura das ações do Xerife (`xerife_log`) que o RLS já limita à equipe
 * de quem tem `xerife.ver_equipe`, mais o registro das avaliações
 * ("cobrança justa" / "cobrança indevida") e dos casos em que o Xerife
 * "deixou passar". Nenhuma ação daqui cobra, altera ou apaga nada.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export const PERM_XERIFE_VER_EQUIPE = "xerife.ver_equipe";
export const PERM_XERIFE_AVALIAR = "xerife.avaliar";

async function assertPerm(supabase: Sb, userId: string, chave: string) {
  const ok = await assertRpcPermissao(
    await supabase.rpc("tem_permissao", { _user_id: userId, _chave: chave }),
    `xerife-auditoria/tem_permissao:${chave}`,
    { userId },
  );
  if (!ok) throw new Error("Você não tem acesso à auditoria do Xerife.");
}

async function ehAdmin(supabase: Sb, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}

export type AcaoXerife = {
  id: string;
  regra: string;
  acao_tomada: string | null;
  created_at: string;
  vendedor_id: string | null;
  vendedor: string | null;
  lead_id: string | null;
  lead: string | null;
  avaliacao: { veredito: "justa" | "indevida"; nota: string | null } | null;
};

const filtrosSchema = z.object({
  vendedorId: z.string().uuid().optional(),
  regra: z.string().optional(),
  de: z.string().optional(),
  ate: z.string().optional(),
  limite: z.number().int().min(1).max(500).optional(),
});

/** Ações do Xerife visíveis para o auditor (escopo garantido pelo RLS). */
export const listarAcoesXerife = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => filtrosSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPerm(supabase, userId, PERM_XERIFE_VER_EQUIPE);

    let q = supabase
      .from("xerife_log")
      .select("id, regra, acao_tomada, created_at, vendedor_id, lead_id")
      .order("created_at", { ascending: false })
      .limit(data.limite ?? 200);
    if (data.vendedorId) q = q.eq("vendedor_id", data.vendedorId);
    if (data.regra) q = q.eq("regra", data.regra);
    if (data.de) q = q.gte("created_at", data.de);
    if (data.ate) q = q.lte("created_at", data.ate);

    const { data: logs, error } = await q;
    if (error) throw new Error(error.message);
    const linhas = logs ?? [];
    if (linhas.length === 0) return [] as AcaoXerife[];

    const vendIds = [...new Set(linhas.map((l: Sb) => l.vendedor_id).filter(Boolean))];
    const leadIds = [...new Set(linhas.map((l: Sb) => l.lead_id).filter(Boolean))];
    const [{ data: perfis }, { data: leads }, { data: avals }] = await Promise.all([
      vendIds.length
        ? supabase.from("profiles").select("id, name").in("id", vendIds)
        : Promise.resolve({ data: [] }),
      leadIds.length
        ? supabase.from("leads").select("id, company").in("id", leadIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("xerife_avaliacoes")
        .select("xerife_log_id, veredito, nota")
        .in(
          "xerife_log_id",
          linhas.map((l: Sb) => l.id),
        ),
    ]);

    const nomeDe = new Map((perfis ?? []).map((p: Sb) => [p.id, p.name as string]));
    const empresaDe = new Map((leads ?? []).map((l: Sb) => [l.id, l.company as string]));
    const avalDe = new Map((avals ?? []).map((a: Sb) => [a.xerife_log_id, a]));

    return linhas.map((l: Sb) => ({
      id: l.id,
      regra: l.regra,
      acao_tomada: l.acao_tomada ?? null,
      created_at: l.created_at,
      vendedor_id: l.vendedor_id ?? null,
      vendedor: l.vendedor_id ? (nomeDe.get(l.vendedor_id) ?? null) : null,
      lead_id: l.lead_id ?? null,
      lead: l.lead_id ? (empresaDe.get(l.lead_id) ?? null) : null,
      avaliacao: avalDe.get(l.id)
        ? {
            veredito: avalDe.get(l.id).veredito as "justa" | "indevida",
            nota: (avalDe.get(l.id).nota as string | null) ?? null,
          }
        : null,
    })) as AcaoXerife[];
  });

/** Vendedores e regras disponíveis nos filtros (dentro do escopo do RLS). */
export const opcoesAuditoriaXerife = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertPerm(supabase, userId, PERM_XERIFE_VER_EQUIPE);

    const { data: logs } = await supabase
      .from("xerife_log")
      .select("regra, vendedor_id")
      .order("created_at", { ascending: false })
      .limit(2000);
    const regras = [...new Set((logs ?? []).map((l: Sb) => l.regra as string))].sort();
    const vendIds = [...new Set((logs ?? []).map((l: Sb) => l.vendedor_id).filter(Boolean))];
    const { data: perfis } = vendIds.length
      ? await supabase.from("profiles").select("id, name").in("id", vendIds)
      : { data: [] };
    const vendedores = (perfis ?? [])
      .map((p: Sb) => ({ id: p.id as string, nome: (p.name as string) ?? "—" }))
      .sort((a: Sb, b: Sb) => a.nome.localeCompare(b.nome, "pt-BR"));
    const podeAvaliar = await supabase
      .rpc("tem_permissao", { _user_id: userId, _chave: PERM_XERIFE_AVALIAR })
      .then((r: Sb) => r.data === true);
    return { regras, vendedores, podeAvaliar, isAdmin: await ehAdmin(supabase, userId) };
  });

const vereditoSchema = z.object({
  xerifeLogId: z.string().uuid(),
  veredito: z.enum(["justa", "indevida"]),
  nota: z.string().max(2000).optional(),
});

/** Registra (ou corrige) a avaliação de uma ação do Xerife. */
export const avaliarAcaoXerife = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => vereditoSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPerm(supabase, userId, PERM_XERIFE_AVALIAR);

    const { error } = await supabase.from("xerife_avaliacoes").upsert(
      {
        xerife_log_id: data.xerifeLogId,
        avaliador_id: userId,
        veredito: data.veredito,
        nota: data.nota?.trim() || null,
      },
      { onConflict: "xerife_log_id,avaliador_id" },
    );
    if (error) throw new Error(error.message);

    const audit = await supabase.from("user_audit_log").insert({
      ator_user_id: userId,
      alvo_user_id: userId,
      campo: "xerife_avaliacao",
      valor_anterior: null,
      valor_novo: `${data.xerifeLogId}:${data.veredito}`,
    });
    if (audit?.error) {
      await registrarFalhaSegura("xerife-auditoria/avaliar-auditoria", audit.error, {
        xerife_log_id: data.xerifeLogId,
      });
    }
    return { ok: true as const };
  });

const deixouPassarSchema = z.object({
  vendedorId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
  descricao: z.string().min(5).max(2000),
});

/** Registra uma situação que o Xerife deveria ter cobrado e não cobrou. */
export const registrarDeixouPassar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => deixouPassarSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPerm(supabase, userId, PERM_XERIFE_AVALIAR);

    const { error } = await supabase.from("xerife_deixou_passar").insert({
      vendedor_id: data.vendedorId,
      lead_id: data.leadId ?? null,
      descricao: data.descricao.trim(),
      avaliador_id: userId,
    });
    if (error) throw new Error(error.message);

    const audit = await supabase.from("user_audit_log").insert({
      ator_user_id: userId,
      alvo_user_id: data.vendedorId,
      campo: "xerife_deixou_passar",
      valor_anterior: null,
      valor_novo: data.descricao.trim().slice(0, 200),
    });
    if (audit?.error) {
      await registrarFalhaSegura("xerife-auditoria/deixou-passar-auditoria", audit.error, {
        vendedor_id: data.vendedorId,
      });
    }
    return { ok: true as const };
  });

export type ResumoRegra = {
  regra: string;
  justas: number;
  indevidas: number;
  deixou_passar: number;
};

/** Resumo por regra — só administradores (é a base para ajustar o Xerife). */
export const resumoAuditoriaXerife = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await ehAdmin(supabase, userId))) {
      throw new Error("Somente administradores.");
    }

    const [{ data: avals }, { data: passou }] = await Promise.all([
      supabase.from("xerife_avaliacoes").select("veredito, xerife_log_id"),
      supabase.from("xerife_deixou_passar").select("id"),
    ]);
    const logIds = [...new Set((avals ?? []).map((a: Sb) => a.xerife_log_id))];
    const { data: logs } = logIds.length
      ? await supabase.from("xerife_log").select("id, regra").in("id", logIds)
      : { data: [] };
    const regraDe = new Map((logs ?? []).map((l: Sb) => [l.id, l.regra as string]));

    const mapa = new Map<string, ResumoRegra>();
    for (const a of avals ?? []) {
      const regra = regraDe.get((a as Sb).xerife_log_id) ?? "—";
      const atual = mapa.get(regra) ?? { regra, justas: 0, indevidas: 0, deixou_passar: 0 };
      if ((a as Sb).veredito === "justa") atual.justas += 1;
      else atual.indevidas += 1;
      mapa.set(regra, atual);
    }
    const linhas = [...mapa.values()].sort((a, b) => a.regra.localeCompare(b.regra, "pt-BR"));
    return { porRegra: linhas, deixouPassarTotal: (passou ?? []).length };
  });
