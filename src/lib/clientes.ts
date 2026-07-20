// Helpers client-safe para tratamento de erros da área de Clientes.

const GENERIC = "Não foi possível salvar o cliente. Tente novamente.";
const DUP_CNPJ = "Já existe um cliente com este CNPJ.";

/**
 * Converte erros de save de cliente em mensagem amigável PT-BR.
 * Nunca vaza JSON, stack, UUID ou texto de constraint do Postgres.
 */
export function friendlyClienteError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const msg = (raw ?? "").trim();
  if (!msg) return GENERIC;

  // Erro cru de constraint UNIQUE do Postgres → CNPJ duplicado
  if (/clientes_cnpj_key/i.test(msg) || /duplicate key value/i.test(msg)) {
    return DUP_CNPJ;
  }

  // Rejeita payloads que pareçam JSON/HTML
  if (/^[\[{<]/.test(msg)) return GENERIC;

  // Rejeita mensagens muito longas ou com quebras
  if (msg.length > 200 || /\n/.test(msg)) return GENERIC;

  // Preserva mensagens curtas amigáveis conhecidas
  if (
    /cnpj/i.test(msg) ||
    /cliente/i.test(msg) ||
    /obrigat[óo]ri/i.test(msg) ||
    /inv[áa]lid/i.test(msg) ||
    /razão|razao|empresa|estado|uf/i.test(msg) ||
    /reativ/i.test(msg)
  ) {
    return msg;
  }
  return GENERIC;
}
