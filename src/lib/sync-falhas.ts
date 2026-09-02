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

  toast.error(
    `Falha ao salvar ${rotuloColecao(colecao)} — suas últimas alterações podem não ter sido gravadas. Recarregue a página.`,
    { duration: Infinity },
  );
}

/** Só para testes. */
export function _resetAvisosSync(): void {
  ultimoAviso.clear();
}
