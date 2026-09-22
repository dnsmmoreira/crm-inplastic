/**
 * Mensagens claras para falha ao salvar um LEAD.
 *
 * O motor de sync já sabe repetir (transitório) e recarregar do servidor
 * (permanente). O que faltava era o vendedor entender o QUE aconteceu e o que
 * fazer — "Falha ao salvar leads" não diz nada.
 *
 * Função pura: só recebe o erro do PostgREST e devolve texto.
 */

function texto(erro: unknown): string {
  if (!erro) return "";
  if (typeof erro === "string") return erro.toLowerCase();
  if (typeof erro === "object") {
    const e = erro as { message?: unknown; details?: unknown; hint?: unknown };
    return [e.message, e.details, e.hint]
      .filter((v) => typeof v === "string")
      .join(" ")
      .toLowerCase();
  }
  return String(erro).toLowerCase();
}

function codigo(erro: unknown): string {
  if (erro && typeof erro === "object") {
    const c = (erro as { code?: unknown }).code;
    if (typeof c === "string") return c;
    if (typeof c === "number") return String(c);
  }
  return "";
}

export type MotivoFalhaLead =
  | "sem_permissao"
  | "duplicado"
  | "dado_invalido"
  | "conexao"
  | "desconhecido";

export function motivoFalhaLead(erro: unknown): MotivoFalhaLead {
  const t = texto(erro);
  const c = codigo(erro);

  if (
    ["failed to fetch", "network error", "networkerror", "timeout", "timed out", "load failed"].some(
      (x) => t.includes(x),
    )
  ) {
    return "conexao";
  }
  if (c === "42501" || t.includes("row-level security") || t.includes("permission denied")) {
    return "sem_permissao";
  }
  if (c === "23505" || t.includes("duplicate key")) return "duplicado";
  if (["23502", "23503", "23514", "22P02"].includes(c)) return "dado_invalido";
  return "desconhecido";
}

/**
 * Recusa de permissão em que o dono no banco NÃO é outra pessoa. Acusar
 * "pertence a outro vendedor" nesse caso é mentira — foi o que confundiu o
 * Daniel no lead "ELO SOLUCAO", que era dele.
 */
export const MSG_LEAD_RECUSADO_GENERICO =
  "Este lead não foi salvo: o servidor recusou a gravação. Atualizei a tela com os dados do servidor e registrei a falha para o administrador — confira e tente de novo.";

/** Texto pronto para toast — sempre diz o que aconteceu e o próximo passo. */
export function mensagemFalhaLead(erro: unknown): string {
  switch (motivoFalhaLead(erro)) {
    case "sem_permissao":
      return "Este lead não foi salvo: ele pertence a outro vendedor (ou mudou de dono). Atualizei a tela com os dados do servidor — peça a transferência para editá-lo.";
    case "duplicado":
      return "Este lead não foi salvo: já existe outro cadastro com o mesmo CNPJ. Procure o cadastro existente em vez de criar um novo.";
    case "dado_invalido":
      return "Este lead não foi salvo: faltou preencher um dado obrigatório ou algum campo está inválido. Confira o cadastro e salve de novo.";
    case "conexao":
      return "Sem conexão com o servidor agora — o lead ficou pendente e vou tentar salvar de novo automaticamente. Não feche a aba.";
    default:
      return "Não consegui salvar este lead. Sua alteração continua na tela; vou tentar de novo em instantes.";
  }
}
