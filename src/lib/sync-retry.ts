/**
 * Política de repetição do motor de sync (`crm-sync.ts`).
 *
 * Incidente 10/09: a gravação de `tarefas` era recusada e o registro ficava
 * "sujo" para sempre — o mesmo erro voltava a cada ciclo e o vendedor recebia
 * um toast que só sumia recarregando a página.
 *
 * Regra desta camada (só contagem e tempo — nada de rede aqui):
 *  - erro transitório (rede/timeout) reagenda com espera progressiva;
 *  - depois de `MAX_TENTATIVAS` falhas seguidas na MESMA coleção, o motor
 *    desiste da repetição, descarta o pendente daquela coleção e recarrega a
 *    verdade do servidor — as outras coleções continuam salvando normalmente;
 *  - qualquer gravação bem-sucedida zera o contador da coleção.
 */

export const MAX_TENTATIVAS = 3;

/** Espera antes de tentar de novo: 2s, 8s, 20s. */
export const ESPERAS_MS = [2_000, 8_000, 20_000] as const;

export function esperaDaTentativa(tentativa: number): number {
  const i = Math.max(1, tentativa) - 1;
  return ESPERAS_MS[Math.min(i, ESPERAS_MS.length - 1)]!;
}

export type DecisaoRetry = {
  /** Nº de falhas seguidas desta coleção, incluindo a atual. */
  tentativa: number;
  /** Ainda vale repetir? */
  repetir: boolean;
  /** Espera até a nova tentativa (0 quando desistiu). */
  esperaMs: number;
  /** Esgotou o limite: descartar pendente e recarregar do servidor. */
  desistiu: boolean;
};

export class ControleRetry {
  private falhas = new Map<string, number>();

  /** Registra mais uma falha transitória e diz o que fazer. */
  registrarFalha(colecao: string): DecisaoRetry {
    const tentativa = (this.falhas.get(colecao) ?? 0) + 1;
    this.falhas.set(colecao, tentativa);
    if (tentativa >= MAX_TENTATIVAS) {
      this.falhas.delete(colecao);
      return { tentativa, repetir: false, esperaMs: 0, desistiu: true };
    }
    return {
      tentativa,
      repetir: true,
      esperaMs: esperaDaTentativa(tentativa),
      desistiu: false,
    };
  }

  /** Gravação deu certo (ou o pendente foi descartado): zera a contagem. */
  limpar(colecao: string): void {
    this.falhas.delete(colecao);
  }

  tentativas(colecao: string): number {
    return this.falhas.get(colecao) ?? 0;
  }

  limparTudo(): void {
    this.falhas.clear();
  }
}
