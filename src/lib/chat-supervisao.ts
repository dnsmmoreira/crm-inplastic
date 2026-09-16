/**
 * Acompanhamento do Chat Interno (lente de leitura do "Geral").
 * Só transformação de dados — o gate de acesso vive no banco.
 */

export type ConversaSupervisao = {
  canal_id: string;
  tipo: string;
  nome: string | null;
  participantes: string[] | null;
  ultima_em: string | null;
  ultima_previa: string | null;
  total_mensagens: number;
};

export type MensagemSupervisao = {
  id: string;
  canal_id: string;
  autor_user_id: string;
  autor_nome: string | null;
  conteudo: string;
  criado_em: string;
  anexo_path: string | null;
  anexo_nome: string | null;
  anexo_tipo: string | null;
  anexo_tamanho_bytes: number | null;
};

/** Quantas mensagens por página no painel de acompanhamento. */
export const PAGINA_SUPERVISAO = 40;

/**
 * Título da conversa: nome do grupo quando houver, senão os participantes
 * separados por "↔". Sem participantes conhecidos, cai num rótulo neutro.
 */
export function tituloConversaSupervisao(c: {
  tipo: string;
  nome?: string | null;
  participantes?: string[] | null;
}): string {
  const nome = (c.nome ?? "").trim();
  if (c.tipo !== "direto" && nome) return nome;
  const pessoas = (c.participantes ?? []).map((p) => (p ?? "").trim()).filter(Boolean);
  if (pessoas.length > 0) return pessoas.join(" ↔ ");
  return nome || "Conversa";
}

/** Prévia curta da última mensagem, para a lista. */
export function previaConversa(texto: string | null | undefined, max = 80): string {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "Sem mensagens ainda";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Mais recentes primeiro; conversas sem mensagem ficam no fim, por título. */
export function ordenarConversasSupervisao<T extends ConversaSupervisao>(
  linhas: readonly T[],
): T[] {
  return [...(linhas ?? [])].sort((a, b) => {
    if (a.ultima_em && b.ultima_em) {
      return new Date(b.ultima_em).getTime() - new Date(a.ultima_em).getTime();
    }
    if (a.ultima_em) return -1;
    if (b.ultima_em) return 1;
    return tituloConversaSupervisao(a).localeCompare(tituloConversaSupervisao(b), "pt-BR");
  });
}
