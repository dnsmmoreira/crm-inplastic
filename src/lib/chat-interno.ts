/**
 * Regras puras do Chat Interno (mensagens entre usuários do CRM).
 * Nada aqui toca banco nem WhatsApp — só transformação de dados para a tela.
 */

export const CHAT_LIMITE_CARACTERES = 4000;

export type ChatCanalResumo = {
  canalId: string;
  tipo: "geral" | "direto";
  /** Em canais diretos, o id do outro participante. */
  outroUserId: string | null;
  lastReadAt: string | null;
  ultimaMensagemEm: string | null;
  ultimaMensagemTexto: string | null;
  naoLidas: number;
};

export type ChatPessoa = {
  id: string;
  nome: string;
  avatarColor: string | null;
};

export type ChatItemLista = {
  /** `null` quando ainda não existe canal com essa pessoa. */
  canalId: string | null;
  tipo: "geral" | "direto";
  titulo: string;
  outroUserId: string | null;
  avatarColor: string | null;
  ultimaMensagemEm: string | null;
  ultimaMensagemTexto: string | null;
  naoLidas: number;
};

export function primeiroNome(nome: string | null | undefined): string {
  const limpo = (nome ?? "").trim();
  if (!limpo) return "Colega";
  return limpo.split(/\s+/)[0]!;
}

/** Extrai o outro participante a partir da chave `menor:maior` do par. */
export function outroDoParChave(parChave: string | null, euId: string): string | null {
  if (!parChave) return null;
  const [a, b] = parChave.split(":");
  if (!a || !b) return null;
  return a === euId ? b : b === euId ? a : null;
}

export type MensagemBruta = {
  canal_id: string;
  conteudo: string;
  criado_em: string;
  autor_user_id: string;
};

/**
 * Reduz o histórico recente em: última mensagem e quantidade de não lidas
 * por canal (não lida = criada depois do `last_read_at` e de outro autor).
 */
export function resumirPorCanal(
  mensagens: readonly MensagemBruta[],
  leituras: ReadonlyMap<string, string | null>,
  euId: string,
): Map<string, { ultimaEm: string; ultimaTexto: string; naoLidas: number }> {
  const out = new Map<string, { ultimaEm: string; ultimaTexto: string; naoLidas: number }>();
  for (const m of mensagens) {
    const atual = out.get(m.canal_id);
    const naoLida =
      m.autor_user_id !== euId &&
      (() => {
        const lido = leituras.get(m.canal_id) ?? null;
        return !lido || new Date(m.criado_em).getTime() > new Date(lido).getTime();
      })();
    if (!atual) {
      out.set(m.canal_id, {
        ultimaEm: m.criado_em,
        ultimaTexto: m.conteudo,
        naoLidas: naoLida ? 1 : 0,
      });
      continue;
    }
    if (new Date(m.criado_em).getTime() > new Date(atual.ultimaEm).getTime()) {
      atual.ultimaEm = m.criado_em;
      atual.ultimaTexto = m.conteudo;
    }
    if (naoLida) atual.naoLidas += 1;
  }
  return out;
}

/**
 * Monta a lista da coluna esquerda: "Geral" sempre no topo, depois as pessoas
 * ordenadas por mensagem mais recente; quem nunca conversou vai para o fim,
 * em ordem alfabética.
 */
export function montarListaChat(
  pessoas: readonly ChatPessoa[],
  canais: readonly ChatCanalResumo[],
  euId: string,
): ChatItemLista[] {
  const geral = canais.find((c) => c.tipo === "geral") ?? null;
  const porPessoa = new Map<string, ChatCanalResumo>();
  for (const c of canais) {
    if (c.tipo === "direto" && c.outroUserId) porPessoa.set(c.outroUserId, c);
  }

  const diretos: ChatItemLista[] = pessoas
    .filter((p) => p.id !== euId)
    .map((p) => {
      const c = porPessoa.get(p.id) ?? null;
      return {
        canalId: c?.canalId ?? null,
        tipo: "direto" as const,
        titulo: p.nome,
        outroUserId: p.id,
        avatarColor: p.avatarColor,
        ultimaMensagemEm: c?.ultimaMensagemEm ?? null,
        ultimaMensagemTexto: c?.ultimaMensagemTexto ?? null,
        naoLidas: c?.naoLidas ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.ultimaMensagemEm && b.ultimaMensagemEm) {
        return new Date(b.ultimaMensagemEm).getTime() - new Date(a.ultimaMensagemEm).getTime();
      }
      if (a.ultimaMensagemEm) return -1;
      if (b.ultimaMensagemEm) return 1;
      return a.titulo.localeCompare(b.titulo, "pt-BR");
    });

  const itemGeral: ChatItemLista = {
    canalId: geral?.canalId ?? null,
    tipo: "geral",
    titulo: "Geral",
    outroUserId: null,
    avatarColor: null,
    ultimaMensagemEm: geral?.ultimaMensagemEm ?? null,
    ultimaMensagemTexto: geral?.ultimaMensagemTexto ?? null,
    naoLidas: geral?.naoLidas ?? 0,
  };

  return [itemGeral, ...diretos];
}

export function totalNaoLidas(itens: readonly ChatItemLista[]): number {
  return itens.reduce((acc, i) => acc + i.naoLidas, 0);
}

/** Valida o texto antes de enviar. Retorna o texto pronto ou `null`. */
export function prepararTexto(bruto: string): string | null {
  const t = bruto.trim();
  if (!t) return null;
  if (t.length > CHAT_LIMITE_CARACTERES) return null;
  return t;
}
