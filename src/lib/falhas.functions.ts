/**
 * Server functions da tela /falhas — LEITURA e diagnóstico.
 *
 * Nada aqui reprocessa fila, reenvia mensagem ou altera regra de negócio.
 * A única escrita é marcar uma falha como resolvida.
 * Todas exigem a permissão `sistema.ver_falhas`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export type FalhaRow = {
  id: string;
  origem: string;
  mensagem: string;
  contexto: unknown;
  ocorrido_em: string;
  ocorrencias: number;
};

export type FilaTravada = {
  chave: string;
  rotulo: string;
  total: number;
  mais_antigo_em: string | null;
};

export type AvisoSemAceite = {
  user_id: string;
  nome: string;
  total: number;
  mais_antigo_em: string | null;
};

export type PainelFalhas = {
  falhas: FalhaRow[];
  filas: FilaTravada[];
  avisos: AvisoSemAceite[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertVerFalhas(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("tem_permissao", {
    _user_id: userId,
    _chave: "sistema.ver_falhas",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Você não tem permissão para ver as falhas do sistema.");
}

export const listarPainelFalhas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PainelFalhas> => {
    const sb = context.supabase;
    await assertVerFalhas(sb, context.userId);

    // Bloco 1 — falhas abertas
    const { data: falhasData, error: falhasErr } = await sb
      .from("falhas_sistema")
      .select("id, origem, mensagem, contexto, ocorrido_em, ocorrencias")
      .is("resolvido_em", null)
      .order("ocorrido_em", { ascending: false })
      .limit(300);
    if (falhasErr) throw new Error(falhasErr.message);

    // Bloco 2 — filas travadas (contagem + item mais antigo)
    const agora = new Date().toISOString();

    const n8nBase = () => sb.from("n8n_reenvio_fila").select("created_at").eq("status", "pendente");
    const iaBase = () =>
      sb
        .from("ia_respostas_pendentes")
        .select("created_at")
        .eq("status", "pendente")
        .is("enviado_em", null)
        .lte("responder_apos", agora);
    const pedidoBase = () =>
      sb.from("pedido_notificacoes").select("criado_em").eq("status", "pendente");

    const [n8nRows, iaRows, pedidoRows] = await Promise.all([
      n8nBase().order("created_at", { ascending: true }).limit(1000),
      iaBase().order("created_at", { ascending: true }).limit(1000),
      pedidoBase().order("criado_em", { ascending: true }).limit(1000),
    ]);

    const filas: FilaTravada[] = [
      {
        chave: "n8n_reenvio_fila",
        rotulo: "Reenvios ao n8n pendentes",
        total: (n8nRows.data ?? []).length,
        mais_antigo_em: (n8nRows.data ?? [])[0]?.created_at ?? null,
      },
      {
        chave: "ia_respostas_pendentes",
        rotulo: "Respostas da IA vencidas e não enviadas",
        total: (iaRows.data ?? []).length,
        mais_antigo_em: (iaRows.data ?? [])[0]?.created_at ?? null,
      },
      {
        chave: "pedido_notificacoes",
        rotulo: "Notificações de pedido pendentes",
        total: (pedidoRows.data ?? []).length,
        mais_antigo_em: (pedidoRows.data ?? [])[0]?.criado_em ?? null,
      },
    ];

    // Bloco 3 — avisos que exigem aceite e ninguém aceitou
    const { data: notifs } = await sb
      .from("notificacoes")
      .select("user_id, created_at")
      .eq("exige_aceite", true)
      .is("aceito_em", null)
      .order("created_at", { ascending: true })
      .limit(2000);

    const porUser = new Map<string, { total: number; mais_antigo: string }>();
    for (const n of (notifs ?? []) as Array<{ user_id: string; created_at: string }>) {
      const atual = porUser.get(n.user_id);
      if (atual) atual.total += 1;
      else porUser.set(n.user_id, { total: 1, mais_antigo: n.created_at });
    }
    const ids = Array.from(porUser.keys());
    const nomes = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await sb.from("profiles").select("id, nome").in("id", ids);
      for (const p of (profs ?? []) as Array<{ id: string; nome: string | null }>) {
        nomes.set(p.id, p.nome ?? "—");
      }
    }
    const avisos: AvisoSemAceite[] = ids
      .map((id) => ({
        user_id: id,
        nome: nomes.get(id) ?? "—",
        total: porUser.get(id)!.total,
        mais_antigo_em: porUser.get(id)!.mais_antigo,
      }))
      .sort((a, b) => b.total - a.total);

    return { falhas: (falhasData ?? []) as FalhaRow[], filas, avisos };
  });

export const resolverFalha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertVerFalhas(sb, context.userId);
    const { error } = await sb
      .from("falhas_sistema")
      .update({ resolvido_em: new Date().toISOString(), resolvido_por: context.userId })
      .eq("id", data.id)
      .is("resolvido_em", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
