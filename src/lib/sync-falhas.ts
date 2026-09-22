/**
 * Aviso de falha do motor de sync (`crm-sync.ts`) — roda no BROWSER.
 *
 * Aqui não existe `supabaseAdmin`, então a falha vira:
 *   1) `console.error` estruturado;
 *   2) toast persistente para o usuário, avisando que as últimas alterações
 *      podem não ter sido gravadas.
 *
 * O dirty-tracking do registro que falhou NÃO é limpo (ver `syncCollection`),
 * então a próxima rodada de save tenta de novo.
 */

import { toast } from "sonner";
import { mensagemFalhaLead } from "./lead-falha";

const ROTULOS: Record<string, string> = {
  products: "produtos",
  emitters: "empresas emitentes",
  paymentTerms: "condições de pagamento",
  leads: "leads",
  tasks: "tarefas",
  proposals: "propostas",
  proposalItems: "itens da proposta",
  proposalParcelas: "parcelas da proposta",
};

/** Evita empilhar o mesmo toast a cada ciclo de save (1 por minuto por coleção). */
const ultimoAviso = new Map<string, number>();
const INTERVALO_MS = 60_000;

export function rotuloColecao(colecao: string): string {
  return ROTULOS[colecao] ?? colecao;
}

/**
 * Contador de falhas de GRAVAÇÃO. A tela da proposta usa antes/depois do save
 * para não dizer "Alterações salvas" quando alguma parte foi recusada.
 */
let totalFalhasGravacao = 0;
export function contadorFalhasGravacao(): number {
  return totalFalhasGravacao;
}

export function reportarFalhaSync(
  colecao: string,
  operacao: "upsert" | "delete",
  erro: unknown,
  extra?: Record<string, unknown>,
): void {
  totalFalhasGravacao += 1;
  console.error("[crm-sync] falha ao gravar", {
    colecao,
    operacao,
    erro,
    ...(extra ?? {}),
  });


  const agora = Date.now();
  const anterior = ultimoAviso.get(colecao) ?? 0;
  if (agora - anterior < INTERVALO_MS) return;
  ultimoAviso.set(colecao, agora);

  // Lead tem mensagem própria: o vendedor precisa saber se é dono, duplicidade
  // ou dado faltando — "falha ao salvar leads" não ajuda ninguém.
  if (colecao === "leads") {
    // "Pertence a outro vendedor" só pode aparecer quando o dono no banco for
    // MESMO outro. Para qualquer outra recusa: mensagem genérica + /falhas.
    if (motivoFalhaLead(erro) === "sem_permissao") {
      const ids = Array.isArray(extra?.["ids"]) ? (extra["ids"] as string[]) : [];
      void avisarLeadRecusado(ids, erro);
      return;
    }
    toast.error(mensagemFalhaLead(erro), { duration: 12_000 });
    return;
  }

  // Erro permanente (RLS/FK/check): o motor já limpou o pendente e está
  // recarregando do servidor — o usuário não precisa recarregar a página.
  if (extra?.["permanente"] === true) {
    toast.error(
      `Uma alteração em ${rotuloColecao(colecao)} foi recusada pelo servidor (o registro mudou de dono ou não existe mais). Atualizei a tela com os dados do servidor — confira e refaça se precisar.`,
      { duration: 12_000 },
    );
    return;
  }

  // Tentativas esgotadas: o motor parou de repetir, descartou o pendente e
  // recarregou a coleção. Nada de "recarregue a página".
  if (extra?.["esgotado"] === true) {
    toast.error(
      `Não consegui salvar ${rotuloColecao(colecao)} depois de algumas tentativas. Parei de tentar e atualizei a tela com os dados do servidor — confira e refaça a alteração.`,
      { duration: 12_000 },
    );
    return;
  }

  toast.error(
    `Falha ao salvar ${rotuloColecao(colecao)} — vou tentar de novo em instantes.`,
    { duration: 6_000 },
  );
}

/**
 * Falha de LEITURA (carga inicial ou recarga por evento).
 *
 * Importante: o motor NÃO aplica nada no estado quando a leitura falha — a tela
 * continua com os dados anteriores em vez de ficar vazia. O aviso existe para
 * que o usuário saiba que pode estar vendo informação defasada.
 */
export function reportarFalhaLeitura(colecao: string, erro: unknown): void {
  console.error("[crm-sync] falha ao carregar", { colecao, erro });

  const agora = Date.now();
  const chave = `leitura:${colecao}`;
  const anterior = ultimoAviso.get(chave) ?? 0;
  if (agora - anterior < INTERVALO_MS) return;
  ultimoAviso.set(chave, agora);

  toast.warning(
    `Não consegui atualizar ${rotuloColecao(colecao)} agora. Mantive na tela os dados já carregados — eles podem estar desatualizados.`,
    { duration: 8_000 },
  );
}

/** Só para testes. */
export function _resetAvisosSync(): void {
  ultimoAviso.clear();
}

