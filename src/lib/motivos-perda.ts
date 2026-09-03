/**
 * Fonte única de verdade dos motivos de perda de lead.
 * Usada pela UI (diálogo de "marcar como perdido"), pela server function
 * `registrarPerdaLead` e pelo relatório de motivos.
 *
 * Não existe motivo "Outro" — cada perda precisa cair num motivo concreto
 * e ter um detalhe descritivo obrigatório.
 */

export const MOTIVOS_PERDA = [
  "Preço",
  "Concorrente",
  "Prazo de entrega",
  "Produto não atende",
  "Condições comerciais",
  "Sem resposta do cliente",
  "Sem aprovação interna",
  "Demanda cancelada ou adiada",
  "Duplicidade",
  "Lead inválido",
] as const;

export type MotivoPerda = (typeof MOTIVOS_PERDA)[number];

export const MOTIVOS_PERDA_DESCRICAO: Record<MotivoPerda, string> = {
  "Preço": "Perdeu por valor",
  "Concorrente": "Fechou com outro fornecedor",
  "Prazo de entrega": "Prazo/logística não atendeu",
  "Produto não atende": "Medida, especificação, capacidade, avaria",
  "Condições comerciais": "Pagamento, 1ª compra, faturamento não aceitos",
  "Sem resposta do cliente": "Cliente sumiu após contato",
  "Sem aprovação interna": "Cliente não conseguiu aprovar (verba/financeiro dele)",
  "Demanda cancelada ou adiada": "Projeto futuro, cliente perdeu o negócio, não compra agora",
  "Duplicidade": "Lead/proposta repetida (OPA + CRM, proposta refeita)",
  "Lead inválido": "Teste, fornecedor, spam, não era pedido de orçamento",
};

/** Detalhe (observação) é obrigatório para todos os motivos. */
export const DETALHE_MIN_CHARS = 10;

export const DETALHE_OBRIGATORIO_MSG =
  "Descreva o motivo em uma frase — isso alimenta o relatório de perdas";

export function isMotivoPerda(v: unknown): v is MotivoPerda {
  return typeof v === "string" && (MOTIVOS_PERDA as readonly string[]).includes(v);
}

export function detalheValido(detalhe: string | null | undefined): boolean {
  return (detalhe ?? "").trim().length >= DETALHE_MIN_CHARS;
}

/**
 * Dias até o recontato sugerido. `null` = não recontatar.
 */
export function recontatoDias(motivo: MotivoPerda): number | null {
  if (motivo === "Duplicidade" || motivo === "Lead inválido") return null;
  if (motivo === "Demanda cancelada ou adiada") return 180;
  return 90;
}

/** Ordem canônica para relatórios (índice na lista; desconhecidos vão pro fim). */
export function ordemMotivo(motivo: string): number {
  const i = (MOTIVOS_PERDA as readonly string[]).indexOf(motivo);
  return i === -1 ? MOTIVOS_PERDA.length : i;
}
