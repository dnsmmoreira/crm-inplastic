/**
 * Chat Interno — leitura consolidada da coluna esquerda.
 * Envio de mensagem e marcação de leitura ficam no client (RLS cobre os dois).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import {
  montarListaChat,
  outroDoParChave,
  resumirPorCanal,
  type ChatCanalResumo,
  type ChatItemLista,
  type ChatPessoa,
  type MensagemBruta,
} from "@/lib/chat-interno";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/** Janela de histórico usada só para montar prévia e contagem da lista. */
const LIMITE_RESUMO = 1000;

export const resumoChatInterno = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ itens: ChatItemLista[] }> => {
    const sb: LooseClient = context.supabase;
    const eu = context.userId as string;

    const { data: membros, error: eMembros } = await sb
      .from("chat_canal_membros")
      .select("canal_id, last_read_at");
    if (eMembros) throw new Error(`Falha ao carregar conversas: ${eMembros.message}`);
    const linhas = (membros ?? []) as { canal_id: string; last_read_at: string | null }[];
    const canalIds = linhas.map((l) => l.canal_id);

    const [{ data: pessoasRaw, error: ePessoas }, canaisRes, mensagensRes] = await Promise.all([
      // A RLS de `profiles` só devolve a própria linha para não-admin; esta função
      // SECURITY DEFINER existe só para listar colegas ativos do chat.
      sb.rpc("chat_listar_colegas"),
      canalIds.length
        ? sb.from("chat_canais").select("id, tipo, par_chave").in("id", canalIds)
        : Promise.resolve({ data: [], error: null }),
      canalIds.length
        ? sb
            .from("chat_mensagens")
            .select("canal_id, conteudo, criado_em, autor_user_id")
            .in("canal_id", canalIds)
            .order("criado_em", { ascending: false })
            .limit(LIMITE_RESUMO)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (ePessoas) throw new Error(`Falha ao carregar pessoas: ${ePessoas.message}`);
    if (canaisRes.error) throw new Error(`Falha ao carregar canais: ${canaisRes.error.message}`);
    if (mensagensRes.error)
      throw new Error(`Falha ao carregar mensagens: ${mensagensRes.error.message}`);

    const leituras = new Map(linhas.map((l) => [l.canal_id, l.last_read_at]));
    const resumo = resumirPorCanal(
      (mensagensRes.data ?? []) as MensagemBruta[],
      leituras,
      eu,
    );

    const canais: ChatCanalResumo[] = (
      (canaisRes.data ?? []) as { id: string; tipo: "geral" | "direto"; par_chave: string | null }[]
    ).map((c) => {
      const r = resumo.get(c.id);
      return {
        canalId: c.id,
        tipo: c.tipo,
        outroUserId: outroDoParChave(c.par_chave, eu),
        lastReadAt: leituras.get(c.id) ?? null,
        ultimaMensagemEm: r?.ultimaEm ?? null,
        ultimaMensagemTexto: r?.ultimaTexto ?? null,
        naoLidas: r?.naoLidas ?? 0,
      };
    });

    const pessoas: ChatPessoa[] = (
      (pessoasRaw ?? []) as { id: string; name: string | null; avatar_color: string | null }[]
    ).map((p) => ({ id: p.id, nome: p.name ?? "Usuário", avatarColor: p.avatar_color }));

    return { itens: montarListaChat(pessoas, canais, eu) };
  });
