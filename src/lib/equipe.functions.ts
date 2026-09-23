/**
 * Painel do gestor: resumo "sem próximo ato" e cobrança de uma pessoa.
 * Gate fail-closed: admin, `usuarios.gerenciar` ou gestor direto da pessoa.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertRpcPermissao } from "@/lib/guard-erros";
import type { ResumoEquipe } from "@/lib/equipe.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

async function contexto(sb: LooseClient, userId: string) {
  const admin = await assertRpcPermissao(
    await sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
    "equipe.contexto/has_role",
    { userId },
  );
  const gerencia = await assertRpcPermissao(
    await sb.rpc("tem_permissao", { _user_id: userId, _chave: "usuarios.gerenciar" }),
    "equipe.contexto/tem_permissao",
    { userId },
  );
  const { data: liderados, error } = await sb
    .from("profiles")
    .select("id")
    .eq("gestor_id", userId)
    .eq("ativo", true)
    .is("deleted_at", null);
  if (error) throw new Error(`Falha ao carregar equipe: ${error.message}`);
  return {
    admin: Boolean(admin),
    gerencia: Boolean(gerencia),
    liderados: ((liderados ?? []) as { id: string }[]).map((r) => r.id),
  };
}

const filtroEquipe = z
  .object({ equipeId: z.string().uuid().nullish() })
  .nullish()
  .transform((v) => ({ equipeId: v?.equipeId ?? null }));

export const resumoEquipe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { equipeId?: string | null } | undefined) => filtroEquipe.parse(input))
  .handler(async ({ data, context }): Promise<ResumoEquipe & { podeCobrarTodos: boolean }> => {
    const sb: LooseClient = context.supabase;
    const userId = context.userId as string;
    const ctx = await contexto(sb, userId);
    if (!ctx.admin && !ctx.gerencia && ctx.liderados.length === 0) {
      throw new Error(
        "Você ainda não lidera ninguém no sistema, por isso o painel da equipe está vazio. Fale com a gestão se precisar acompanhar alguém aqui.",
      );
    }
    const { coletarResumoEquipe } = await import("@/lib/equipe.server");
    const resumo = await coletarResumoEquipe(sb, {
      // Restrição de acesso: continua mandando em quem pode ser visto.
      userIds: ctx.admin || ctx.gerencia ? null : ctx.liderados,
      // Filtro da tela: AND com a restrição acima; só reduz, nunca amplia.
      equipeId: data.equipeId,
    });
    return { ...resumo, podeCobrarTodos: ctx.admin };
  });

export const cobrarPessoa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; texto: string }) =>
    z.object({ userId: z.string().uuid(), texto: z.string().min(10).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;
    const ator = context.userId as string;
    const ctx = await contexto(sb, ator);
    const permitido = ctx.admin || ctx.gerencia || ctx.liderados.includes(data.userId);
    if (!permitido) return { ok: false as const, message: "Você não pode cobrar essa pessoa." };
    if (data.userId === ator) return { ok: false as const, message: "Não dá para cobrar a si mesmo." };

    const texto = data.texto.trim();
    // A cobrança é uma notificação para OUTRA pessoa: `notificacoes` não tem
    // policy de INSERT, então o client do usuário é recusado pelo RLS.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { inserirMonitorado } = await import("@/lib/rls-monitor.server");
    const ins = await inserirMonitorado(
      supabaseAdmin,
      "notificacoes",
      {
        user_id: data.userId,
        tipo: "cobranca_gestor",
        titulo: texto.slice(0, 300),
        exige_aceite: true,
      },
      { acao: "equipe.cobrarPessoa", ator_user_id: ator, alvo_user_id: data.userId },
    );
    if (!ins.ok) {
      const msg = (ins.error as { message?: string } | null)?.message ?? "erro desconhecido";
      throw new Error(`Não foi possível enviar a cobrança: ${msg}`);
    }

    const { notifyOwner } = await import("@/lib/xerife/notify.server");
    await notifyOwner(data.userId, `📣 *Cobrança da gestão*\n\n${texto}`);

    const audit = await sb.from("user_audit_log").insert({
      ator_user_id: ator,
      alvo_user_id: data.userId,
      campo: "cobranca_gestor",
      valor_novo: texto.slice(0, 1000),
    });
    if (audit?.error) {
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      await registrarFalhaSegura("equipe.cobrarPessoa/auditoria", audit.error, {
        alvo: data.userId,
      });
    }
    return { ok: true as const };
  });

export type LinhaCarteira = {
  leadId: string;
  clienteId: string | null;
  empresa: string;
  donoAtual: string | null;
  donoAtualNome: string;
  donoCarteiraNome: string;
};

export type DevolucaoCarteira = { vendedor: string; total: number };

export type RelatorioCarteira = {
  donoDivergente: LinhaCarteira[];
  clienteExistente: LinhaCarteira[];
  devolucoes: DevolucaoCarteira[];
};

/** Painel do gestor: onde a carteira e o atendimento não batem. */
export const relatorioCarteira = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { equipeId?: string | null } | undefined) => filtroEquipe.parse(input))
  .handler(async ({ data: entrada, context }): Promise<RelatorioCarteira> => {
    const sb: LooseClient = context.supabase;
    const userId = context.userId as string;
    const ctx = await contexto(sb, userId);
    if (!ctx.admin && !ctx.gerencia && ctx.liderados.length === 0) {
      throw new Error(
        "Você ainda não lidera ninguém no sistema, por isso o painel da equipe está vazio. Fale com a gestão se precisar acompanhar alguém aqui.",
      );
    }

    const desde = new Date(Date.now() - 30 * 86400_000).toISOString();

    // Carteira não tem equipe na linha: o recorte é pela PESSOA RESPONSÁVEL
    // (dono atual do lead / vendedor da devolução), igual ao resto da tela.
    // Só reduz o conjunto — a restrição de acesso continua valendo pela RLS.
    let idsEquipe: string[] | null = null;
    if (entrada.equipeId) {
      const { data: pessoas, error } = await sb
        .from("profiles")
        .select("id")
        .eq("equipe_id", entrada.equipeId)
        .eq("ativo", true)
        .is("deleted_at", null);
      if (error) throw new Error(`Falha ao carregar a equipe: ${error.message}`);
      idsEquipe = ((pessoas ?? []) as { id: string }[]).map((p) => p.id);
      if (idsEquipe.length === 0) return { donoDivergente: [], clienteExistente: [], devolucoes: [] };
    }

    let qLeads = sb
      .from("leads")
      .select("id, company, owner_id, cliente_id, tags, created_at, stage")
      .not("stage", "in", "(ganho,perdido)");
    if (idsEquipe) qLeads = qLeads.in("owner_id", idsEquipe);
    const { data: leads, error: errLeads } = await qLeads.limit(1000);
    if (errLeads) throw new Error(`Falha ao ler atendimentos: ${errLeads.message}`);

    const idsClientes = [
      ...new Set(
        ((leads ?? []) as { cliente_id: string | null }[])
          .map((l) => l.cliente_id)
          .filter(Boolean) as string[],
      ),
    ];
    const vendPorCliente = new Map<string, string | null>();
    if (idsClientes.length > 0) {
      const { data: cls, error } = await sb
        .from("clientes")
        .select("id, vendedor_id")
        .in("id", idsClientes);
      if (error) throw new Error(`Falha ao ler clientes: ${error.message}`);
      for (const c of cls ?? []) vendPorCliente.set(c.id as string, c.vendedor_id as string | null);
    }

    const { data: perfis, error: errPerfis } = await sb.from("profiles").select("id, name");
    if (errPerfis) throw new Error(`Falha ao ler pessoas: ${errPerfis.message}`);
    const nomes = new Map<string, string>();
    for (const p of perfis ?? []) nomes.set(p.id as string, (p.name as string) ?? "Sem nome");
    const nome = (id: string | null | undefined) =>
      (id && nomes.get(id)) || "Sem responsável";

    const donoDivergente: LinhaCarteira[] = [];
    const clienteExistente: LinhaCarteira[] = [];
    for (const l of (leads ?? []) as any[]) {
      const donoCarteira = l.cliente_id ? vendPorCliente.get(l.cliente_id) ?? null : null;
      const linha: LinhaCarteira = {
        leadId: l.id as string,
        clienteId: (l.cliente_id as string | null) ?? null,
        empresa: (l.company as string) ?? "Sem nome",
        donoAtual: (l.owner_id as string | null) ?? null,
        donoAtualNome: nome(l.owner_id as string | null),
        donoCarteiraNome: nome(donoCarteira),
      };
      if (donoCarteira && donoCarteira !== l.owner_id) donoDivergente.push(linha);
      if (
        Array.isArray(l.tags) &&
        l.tags.includes("cliente_existente") &&
        (l.created_at as string) >= desde
      ) {
        clienteExistente.push(linha);
      }
    }

    let qLogs = sb
      .from("xerife_log")
      .select("vendedor_id, regra, created_at")
      .gte("created_at", desde)
      .like("regra", "D1_abandono%");
    if (idsEquipe) qLogs = qLogs.in("vendedor_id", idsEquipe);
    const { data: logs, error: errLog } = await qLogs.limit(1000);
    if (errLog) throw new Error(`Falha ao ler histórico: ${errLog.message}`);
    const porVendedor = new Map<string, number>();
    for (const r of (logs ?? []) as any[]) {
      const k = (r.vendedor_id as string | null) ?? "";
      porVendedor.set(k, (porVendedor.get(k) ?? 0) + 1);
    }
    const devolucoes: DevolucaoCarteira[] = [...porVendedor.entries()]
      .map(([id, total]) => ({ vendedor: nome(id || null), total }))
      .sort((a, b) => b.total - a.total);

    return { donoDivergente, clienteExistente, devolucoes };
  });
