/**
 * Desfecho obrigatório das tarefas do Xerife — módulo puro (sem Supabase/React).
 *
 * Problema que ele resolve: concluir uma tarefa do Xerife sem mudar nada no lead
 * fazia o motor recriar a mesma cobrança na rodada seguinte. Agora toda tarefa
 * comercial do Xerife exige um DESFECHO, que vira estado no lead
 * (`next_followup`, `stage`, `motivo_perda`) e silencia a cobrança.
 */

import { MOTIVOS_PERDA, isMotivoPerda } from "@/lib/motivos-perda";

/** Tipos de tarefa comercial criados pelo Xerife que exigem desfecho. */
export const TIPOS_COMERCIAIS_XERIFE = [
  "follow_up",
  "retomar_contato",
  "primeiro_contato",
  "resposta_pendente",
  "cadencia_proposta",
  "resgate_carteira",
  "reativacao_lead",
  "conversa_parada",
] as const;

export type TipoComercialXerife = (typeof TIPOS_COMERCIAIS_XERIFE)[number];

export type TarefaParaDesfecho = {
  origem?: string | null;
  tipo?: string | null;
  lead_id?: string | null;
  pedido_id?: string | null;
};

/**
 * Tarefas manuais, de pedido e de pós-venda seguem o fluxo antigo (nota;
 * pós-venda exige nota >= 10). Só tarefa comercial do Xerife ligada a um lead
 * exige desfecho — exceção: `conversa_parada` pode não ter lead (conversa
 * avulsa) e mesmo assim exige desfecho.
 */
export function exigeDesfecho(t: TarefaParaDesfecho): boolean {
  if (t.origem !== "xerife") return false;
  if (t.pedido_id) return false;
  if (t.tipo === "conversa_parada") return true;
  if (!t.lead_id) return false;
  return (TIPOS_COMERCIAIS_XERIFE as readonly string[]).includes(t.tipo ?? "");
}


export const DESFECHOS = [
  {
    tipo: "retorno_agendado",
    rotulo: "Falei com o cliente — retorno em [data]",
    descricao:
      "Combinei um retorno. O Xerife não cobra este lead até a data e cria a tarefa do retorno.",
  },
  {
    tipo: "avancou_etapa",
    rotulo: "O lead avançou de etapa",
    descricao: "Move o lead para a próxima etapa do funil.",
  },
  {
    tipo: "perdido",
    rotulo: "Marcar como perdido",
    descricao: "Encerra o lead com motivo estruturado (entra no relatório de perdas).",
  },
  {
    tipo: "em_espera",
    rotulo: "Coloquei o atendimento em espera até [data]",
    descricao: "A conversa fica aguardando o cliente e o Xerife só volta a cobrar na data.",
  },
  {
    tipo: "encerrar_conversa",
    rotulo: "Encerrar a conversa",
    descricao: "Fecha o atendimento no WhatsApp com o motivo registrado.",
  },
  {
    tipo: "sem_pendencia",
    rotulo: "Sem pendência (a tarefa não fazia mais sentido)",
    descricao: "Fecha a tarefa com uma justificativa curta, sem mudar o lead.",
  },
] as const;

export type DesfechoTipo = (typeof DESFECHOS)[number]["tipo"];

/**
 * Desfechos que NÃO vêm de uma escolha do vendedor:
 *  - 'manual': rede de segurança do trigger (marcado como feito na lista antiga);
 *  - 'automatico': o sistema encerrou porque a tarefa perdeu o motivo
 *    (ver `src/lib/tarefas-encerramento.ts`).
 */
export const DESFECHOS_SISTEMA = ["manual", "automatico"] as const;

export type DesfechoRegistrado = DesfechoTipo | (typeof DESFECHOS_SISTEMA)[number];

export function isDesfechoTipo(v: unknown): v is DesfechoTipo {
  return typeof v === "string" && DESFECHOS.some((d) => d.tipo === v);
}

/**
 * Quais desfechos a tarefa oferece.
 *  - `conversa_parada`: retorno, espera, encerrar a conversa, perdido (só com
 *    lead) e sem pendência — avançar etapa não faz sentido aqui;
 *  - demais tipos: o conjunto clássico do funil.
 */
export function desfechosParaTipo(
  tipoTarefa: string | null | undefined,
  opts: { temLead?: boolean } = {},
): typeof DESFECHOS[number][] {
  const temLead = opts.temLead !== false;
  if (tipoTarefa === "conversa_parada") {
    const permitidos = ["retorno_agendado", "em_espera", "encerrar_conversa", "sem_pendencia"];
    if (temLead) permitidos.splice(3, 0, "perdido");
    return DESFECHOS.filter((d) => permitidos.includes(d.tipo));
  }
  return DESFECHOS.filter(
    (d) => d.tipo !== "em_espera" && d.tipo !== "encerrar_conversa",
  ) as typeof DESFECHOS[number][];
}

/** O desfecho escolhido é válido para o tipo da tarefa? (gate fail-closed) */
export function desfechoPermitido(
  tipoTarefa: string | null | undefined,
  desfecho: string,
  opts: { temLead?: boolean } = {},
): boolean {
  return desfechosParaTipo(tipoTarefa, opts).some((d) => d.tipo === desfecho);
}


// ─────────────── Etapas ───────────────

/** Ordem do funil de vendas do projeto (crm-store): atendimento → … → negociação. */
const ORDEM_ETAPAS: Record<string, string | null> = {
  atendimento: "qualificacao",
  novo: "qualificacao",
  qualificacao: "proposta",
  proposta: "negociacao",
  negociacao: null,
};

export const MSG_NEGOCIACAO_SEM_AVANCO =
  "Não há próxima etapa: para Ganho use o funil, que gera o pedido.";

export function proximaEtapa(stageAtual: string | null | undefined): string | null {
  if (!stageAtual) return null;
  return ORDEM_ETAPAS[stageAtual] ?? null;
}

export function etapasAvancoPermitidas(stageAtual: string | null | undefined): string[] {
  const p = proximaEtapa(stageAtual);
  return p ? [p] : [];
}

// ─────────────── Carência ───────────────

/**
 * Carência antes de o Xerife poder cobrar o MESMO tipo de tarefa no mesmo lead.
 * UNIDADE: horas ÚTEIS (janela `xerife_config.dias_uteis_inicio/fim`, Seg-Sex).
 * Um dia útil = 10h úteis na janela padrão 08:00–18:00.
 */
export function carenciaHorasUteis(tipo: string | null | undefined): number {
  switch (tipo) {
    case "follow_up":
    case "retomar_contato":
    case "primeiro_contato":
      return 20; // 2 dias úteis
    case "resposta_pendente":
      return 12;
    case "cadencia_proposta":
      return 0; // já é 1 por passo da cadência
    case "resgate_carteira":
      return 70; // ~7 dias úteis
    case "reativacao_lead":
      return 300; // ~30 dias úteis
    default:
      if (typeof tipo === "string" && tipo.startsWith("pos_venda_")) return 300;
      return 0;
  }
}

/** "" para a 1ª cobrança; " · 2ª cobrança" em diante. */
export function sufixoCobranca(n: number | null | undefined): string {
  const v = Number(n ?? 1);
  if (!Number.isFinite(v) || v <= 1) return "";
  return ` · ${Math.floor(v)}ª cobrança`;
}

// ─────────────── Datas ───────────────

/** yyyy-mm-dd → ISO ancorado ao meio-dia UTC (mesma convenção da agenda). */
export function dataRetornoParaISO(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return `${v}T12:00:00.000Z`;
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new Error("Data de retorno inválida.");
  return d.toISOString();
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Próximo dia útil (Seg-Sex) depois de `base`, em yyyy-mm-dd. */
export function proximoDiaUtil(base = new Date()): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return ymd(d);
}

/** Soma N dias úteis a partir de hoje, em yyyy-mm-dd. */
export function somarDiasUteis(n: number, base = new Date()): string {
  let atual = proximoDiaUtil(base);
  for (let i = 1; i < n; i++) atual = proximoDiaUtil(new Date(`${atual}T12:00:00.000Z`));
  return atual;
}

export const LIMITE_RETORNO_DIAS = 60;
export const JUSTIFICATIVA_MIN_CHARS = 5;

// ─────────────── Validação ───────────────

export type DesfechoInput = {
  tipo: string;
  data?: string | null;
  stage?: string | null;
  motivo?: string | null;
  detalhe?: string | null;
  nota?: string | null;
};

export type ValidacaoDesfecho = { ok: true } | { ok: false; erro: string };

export function validarDesfecho(
  input: DesfechoInput,
  ctx: { stageAtual?: string | null; agora?: Date } = {},
): ValidacaoDesfecho {
  const agora = ctx.agora ?? new Date();
  if (!isDesfechoTipo(input.tipo)) return { ok: false, erro: "Escolha o desfecho desta tarefa." };

  if (input.tipo === "retorno_agendado") {
    const data = (input.data ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return { ok: false, erro: "Informe a data do retorno combinado." };
    }
    const minimo = proximoDiaUtil(agora);
    if (data < minimo) {
      return { ok: false, erro: "O retorno precisa ser marcado a partir do próximo dia útil." };
    }
    const limite = new Date(agora.getTime() + LIMITE_RETORNO_DIAS * 86_400_000);
    if (data > ymd(limite)) {
      return { ok: false, erro: `O retorno não pode passar de ${LIMITE_RETORNO_DIAS} dias.` };
    }
    return { ok: true };
  }

  if (input.tipo === "avancou_etapa") {
    const permitidas = etapasAvancoPermitidas(ctx.stageAtual);
    if (permitidas.length === 0) return { ok: false, erro: MSG_NEGOCIACAO_SEM_AVANCO };
    if (!input.stage || !permitidas.includes(input.stage)) {
      return { ok: false, erro: `Etapa inválida. Permitida: ${permitidas.join(", ")}.` };
    }
    return { ok: true };
  }

  if (input.tipo === "perdido") {
    if (!isMotivoPerda(input.motivo)) {
      return { ok: false, erro: `Escolha um motivo de perda (${MOTIVOS_PERDA.length} opções).` };
    }
    return { ok: true };
  }

  // sem_pendencia
  const just = (input.detalhe ?? "").trim();
  if (just.length < JUSTIFICATIVA_MIN_CHARS) {
    return {
      ok: false,
      erro: `Explique em poucas palavras por que não há pendência (mín. ${JUSTIFICATIVA_MIN_CHARS} caracteres).`,
    };
  }
  return { ok: true };
}

/** dd/mm a partir de yyyy-mm-dd (mensagens para o vendedor). */
export function ddmm(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  return m ? `${m[3]}/${m[2]}` : data;
}
