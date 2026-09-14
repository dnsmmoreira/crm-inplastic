/**
 * Regras puras do Chat Interno (mensagens entre usuários do CRM).
 * Nada aqui toca banco nem WhatsApp — só transformação de dados para a tela.
 */

export const CHAT_LIMITE_CARACTERES = 4000;

/** Tipos de canal. `grupo` = grupo nomeado aberto aos membros cadastrados. */
export type ChatTipoCanal = "geral" | "direto" | "grupo";

export type ChatCanalResumo = {
  canalId: string;
  tipo: ChatTipoCanal;
  /** Nome do canal (usado pelos grupos nomeados). */
  nome?: string | null;
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
  tipo: ChatTipoCanal;
  titulo: string;
  outroUserId: string | null;
  avatarColor: string | null;
  ultimaMensagemEm: string | null;
  ultimaMensagemTexto: string | null;
  naoLidas: number;
};

/* ---------------------------------------------------------------- anexos */

/** Limite por arquivo enviado no chat interno. */
export const MAX_BYTES_ANEXO_CHAT = 15 * 1024 * 1024;

/** Dias até o expurgo automático do arquivo (a mensagem permanece). */
export const DIAS_RETENCAO_ANEXO_CHAT = 15;

/** Allowlist de mime: imagens, PDF, office, csv/texto. Nada executável. */
export const TIPOS_ANEXO_CHAT = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
] as const;

export function tipoAnexoAceito(mime: string | null | undefined): boolean {
  const m = (mime ?? "").toLowerCase().split(";")[0]!.trim();
  return (TIPOS_ANEXO_CHAT as readonly string[]).includes(m);
}

export function ehImagemAnexo(mime: string | null | undefined): boolean {
  return (mime ?? "").toLowerCase().startsWith("image/");
}

/** Retorna a mensagem de erro, ou `null` quando o arquivo pode subir. */
export function validarAnexoChat(file: { size: number; type: string }): string | null {
  if (file.size <= 0) return "Arquivo vazio.";
  if (file.size > MAX_BYTES_ANEXO_CHAT) {
    return "Arquivo muito grande — o limite é de 15 MB.";
  }
  if (!tipoAnexoAceito(file.type)) {
    return "Tipo de arquivo não aceito. Envie imagem, PDF, planilha, documento ou texto.";
  }
  return null;
}

/** Nome de arquivo seguro para o caminho no storage. */
export function nomeAnexoSeguro(nome: string): string {
  return (nome || "arquivo")
    .normalize("NFD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-120);
}

/** Path do anexo: `<canal_id>/<uuid>-<nome sanitizado>`. */
export function caminhoAnexoChat(canalId: string, nomeArquivo: string, uid: string): string {
  return `${canalId}/${uid}-${nomeAnexoSeguro(nomeArquivo)}`;
}

export function formatarTamanhoAnexo(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type AnexoExpuravel = {
  id: string;
  criado_em: string;
  anexo_path: string | null;
};

/**
 * Seleciona os anexos que o expurgo pode apagar: com arquivo e com mais de
 * 15 dias corridos. Sem `anexo_path` nunca entra; data inválida nunca entra.
 */
export function anexosChatExpirados<T extends AnexoExpuravel>(
  linhas: readonly T[],
  agora: Date = new Date(),
): T[] {
  const limite = agora.getTime() - DIAS_RETENCAO_ANEXO_CHAT * 86400_000;
  return (linhas ?? []).filter((l) => {
    if (!l || !l.anexo_path) return false;
    const t = new Date(l.criado_em).getTime();
    if (Number.isNaN(t)) return false;
    return t < limite;
  });
}


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

  // O canal "Geral" só aparece para quem é membro dele (a lista de canais já
  // chega filtrada por RLS). Sem canal, não existe item — nada de item morto.
  if (!geral) return diretos;

  const itemGeral: ChatItemLista = {
    canalId: geral.canalId,
    tipo: "geral",
    titulo: "Geral",
    outroUserId: null,
    avatarColor: null,
    ultimaMensagemEm: geral.ultimaMensagemEm,
    ultimaMensagemTexto: geral.ultimaMensagemTexto,
    naoLidas: geral.naoLidas,
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
