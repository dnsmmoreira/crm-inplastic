/**
 * Lógica pura de documentos anexados a clientes e pedidos.
 * Sem acesso a rede/banco — é o que os testes cobrem.
 */

export const CATEGORIAS_DOCUMENTO = [
  { value: "contrato_social", label: "Contrato Social" },
  { value: "balanco", label: "Balanço" },
  { value: "cartao_cnpj", label: "Cartão CNPJ" },
  { value: "margem_compra", label: "Margem de Compra" },
  { value: "foto_entrega", label: "Foto da entrega" },
  { value: "canhoto_nf", label: "Canhoto da NF assinado" },
  { value: "comprovante_entrega", label: "Comprovante / recibo" },
  { value: "outro", label: "Outro" },
] as const;

export type CategoriaDocumento = (typeof CATEGORIAS_DOCUMENTO)[number]["value"];

export const CATEGORIAS_VALIDAS = CATEGORIAS_DOCUMENTO.map((c) => c.value) as string[];

export type EntidadeDocumento = "cliente" | "pedido";

/** Meses de validade de um documento a partir do envio. */
export const MESES_VALIDADE_DOCUMENTO = 12;

export function categoriaLabel(categoria: string, categoriaOutro?: string | null): string {
  if (categoria === "outro") {
    const livre = (categoriaOutro ?? "").trim();
    return livre || "Outro";
  }
  return CATEGORIAS_DOCUMENTO.find((c) => c.value === categoria)?.label ?? categoria;
}

/** Documento está vencido quando `agora` já passou de `expiraEm`. */
export function ehDocumentoVencido(
  expiraEm: string | Date | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!expiraEm) return false;
  const exp = expiraEm instanceof Date ? expiraEm : new Date(expiraEm);
  if (Number.isNaN(exp.getTime())) return false;
  return agora.getTime() > exp.getTime();
}

/** Data de expiração = envio + 12 meses. */
export function calcularExpiracao(enviadoEm: Date = new Date()): Date {
  const d = new Date(enviadoEm.getTime());
  d.setMonth(d.getMonth() + MESES_VALIDADE_DOCUMENTO);
  return d;
}

/**
 * Valida os campos de categoria. Categoria "outro" exige rótulo livre.
 * Retorna a mensagem de erro ou `null` quando válido.
 */
export function validarCategoria(
  categoria: string,
  categoriaOutro?: string | null,
): string | null {
  if (!CATEGORIAS_VALIDAS.includes(categoria)) return "Categoria inválida.";
  if (categoria === "outro" && !(categoriaOutro ?? "").trim()) {
    return "Informe o nome do documento quando a categoria for “Outro”.";
  }
  return null;
}

/** Nome de arquivo seguro para o caminho no storage. */
export function nomeArquivoSeguro(nome: string): string {
  return (nome || "arquivo")
    .normalize("NFD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-120);
}

export function caminhoStorage(
  entidadeTipo: EntidadeDocumento,
  entidadeId: string,
  nomeArquivo: string,
  uid: string,
): string {
  return `${entidadeTipo}/${entidadeId}/${uid}-${nomeArquivoSeguro(nomeArquivo)}`;
}

export function formatarTamanho(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
