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

export function reportarFalhaSync(
  colecao: string,
  operacao: "upsert" | "delete",
  erro: unknown,
  extra?: Record<string, unknown>,
): void {
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

/** Só para testes. */
export function _resetAvisosSync(): void {
  ultimoAviso.clear();
}
