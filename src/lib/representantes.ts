/**
 * Módulo puro do roster de representantes.
 *
 * Recebe LOTES já carregados (uma consulta por tabela, nunca uma por pessoa) e
 * monta as linhas da tela `/representantes`. Sem acesso a rede/banco aqui.
 */

export const CARGO_REPRESENTANTE = "Representante";

/** Compara o nome do cargo ignorando caixa e espaços em volta. */
export function ehCargoRepresentante(cargo: string | null | undefined): boolean {
  return (cargo ?? "").trim().toLowerCase() === CARGO_REPRESENTANTE.toLowerCase();
}

/** Estágios que tiram o lead da contagem de "leads abertos". */
const STAGES_FECHADOS = new Set(["ganho", "perdido"]);

export type RepresentanteBase = {
  id: string;
  nome: string;
  ativo: boolean;
  deletedAt: string | null;
  /** Vem de `arena_participacao` (null quando não há linha). */
  participaArena: boolean | null;
  tipoComercial: string | null;
};

export type LotesRepresentantes = {
  clientes: Array<{ vendedor_id: string | null }>;
  leads: Array<{ owner_id: string | null; stage: string | null; updated_at: string | null }>;
  propostas: Array<{ owner_id: string | null; created_at: string | null }>;
  conversas: Array<{ atribuido_para: string | null; last_message_at: string | null }>;
};

export type RepresentanteLinha = {
  id: string;
  nome: string;
  ativo: boolean;
  excluido: boolean;
  participaArena: boolean;
  tipoComercial: string | null;
  carteira: number;
  leadsAbertos: number;
  propostasMes: number;
  ultimaAtividade: string | null;
};

/** Primeiro instante do mês corrente, em ISO, a partir de uma referência. */
export function inicioDoMes(agora: Date): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
}

function maisRecente(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * Monta as linhas do roster. `propostas` já vem filtrada pelo mês corrente na
 * consulta; o filtro é reaplicado aqui para o módulo ser autossuficiente.
 */
export function montarRepresentantes(
  base: RepresentanteBase[],
  lotes: LotesRepresentantes,
  agora: Date = new Date(),
): RepresentanteLinha[] {
  const ids = new Set(base.map((b) => b.id));
  const carteira = new Map<string, number>();
  const abertos = new Map<string, number>();
  const propostas = new Map<string, number>();
  const atividade = new Map<string, string | null>();
  const desde = inicioDoMes(agora);

  for (const c of lotes.clientes) {
    if (!c.vendedor_id || !ids.has(c.vendedor_id)) continue;
    carteira.set(c.vendedor_id, (carteira.get(c.vendedor_id) ?? 0) + 1);
  }
  for (const l of lotes.leads) {
    if (!l.owner_id || !ids.has(l.owner_id)) continue;
    if (!STAGES_FECHADOS.has((l.stage ?? "").toLowerCase())) {
      abertos.set(l.owner_id, (abertos.get(l.owner_id) ?? 0) + 1);
    }
    atividade.set(l.owner_id, maisRecente(atividade.get(l.owner_id) ?? null, l.updated_at));
  }
  for (const p of lotes.propostas) {
    if (!p.owner_id || !ids.has(p.owner_id)) continue;
    if (!p.created_at || p.created_at < desde) continue;
    propostas.set(p.owner_id, (propostas.get(p.owner_id) ?? 0) + 1);
  }
  for (const c of lotes.conversas) {
    if (!c.atribuido_para || !ids.has(c.atribuido_para)) continue;
    atividade.set(
      c.atribuido_para,
      maisRecente(atividade.get(c.atribuido_para) ?? null, c.last_message_at),
    );
  }

  return base
    .map((b) => ({
      id: b.id,
      nome: b.nome,
      ativo: b.ativo,
      excluido: !!b.deletedAt,
      participaArena: b.participaArena === true,
      tipoComercial: b.tipoComercial,
      carteira: carteira.get(b.id) ?? 0,
      leadsAbertos: abertos.get(b.id) ?? 0,
      propostasMes: propostas.get(b.id) ?? 0,
      ultimaAtividade: atividade.get(b.id) ?? null,
    }))
    .sort((a, b) => {
      if (a.excluido !== b.excluido) return a.excluido ? 1 : -1;
      if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
}
