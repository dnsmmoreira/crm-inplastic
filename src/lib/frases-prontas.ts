/**
 * Helpers puros do catálogo de "Frases prontas".
 *
 * Duas coisas diferentes convivem no chat:
 *  - FRASE PRONTA: texto interno colado no compositor pelo atendente. Usa
 *    variáveis nomeadas `{{nome}}`, `{{empresa}}` e `{{atendente}}`.
 *  - MODELO META: template aprovado pela Meta, obrigatório fora da janela de
 *    24h. A Meta só aceita variáveis posicionais `{{1}}`, `{{2}}`…
 *
 * `converterParaMeta` é a ponte entre os dois formatos.
 * Sem dependência de rede/banco — testável isoladamente.
 */

export const VARIAVEIS = ["nome", "empresa", "atendente"] as const;
export type VariavelFrase = (typeof VARIAVEIS)[number];

/** Valores de exemplo enviados à Meta (obrigatórios quando há variáveis). */
export const EXEMPLOS_VARIAVEL: Record<VariavelFrase, string> = {
  nome: "Carlos",
  empresa: "Empresa Exemplo",
  atendente: "Beatriz",
};

/** Ordem de exibição das categorias na tela e no popover do chat. */
export const CATEGORIAS_ORDEM = [
  "abertura",
  "qualificacao",
  "cadastro",
  "proposta",
  "follow-up",
  "fechamento",
  "pos-venda",
  "relacionamento",
  "triagem",
] as const;

export const CATEGORIA_LABEL: Record<string, string> = {
  abertura: "Abertura",
  qualificacao: "Qualificação",
  cadastro: "Cadastro",
  proposta: "Proposta",
  "follow-up": "Follow-up",
  fechamento: "Fechamento",
  "pos-venda": "Pós-venda",
  relacionamento: "Relacionamento",
  triagem: "Triagem",
};

/** Índice da categoria na ordem oficial (categorias desconhecidas vão ao fim). */
export function ordemCategoria(categoria: string): number {
  const i = (CATEGORIAS_ORDEM as readonly string[]).indexOf(categoria);
  return i === -1 ? CATEGORIAS_ORDEM.length : i;
}

export type ValoresFrase = {
  nome?: string | null;
  empresa?: string | null;
  atendente?: string | null;
};

/**
 * Aplica `{{nome}}`, `{{empresa}}` e `{{atendente}}` no corpo da frase.
 *
 * Fallbacks: nome → "tudo bem", empresa → "sua empresa".
 * Para `atendente` não existe fallback razoável (inventar um nome seria pior
 * que omitir), então quando ele está vazio as construções que dependem dele
 * são reescritas para continuarem gramaticais:
 *   "Aqui é {{atendente}}, "        → ""
 *   "Aqui é {{atendente}}. "        → ""
 *   "Me chamo {{atendente}} e vou"  → "Vou"
 * Qualquer `{{atendente}}` restante é simplesmente removido.
 */
export function aplicarVariaveisFrase(corpo: string, vars: ValoresFrase): string {
  const nome = (vars.nome ?? "").trim() || "tudo bem";
  const empresa = (vars.empresa ?? "").trim() || "sua empresa";
  const atendente = (vars.atendente ?? "").trim();

  let texto = String(corpo ?? "");

  if (!atendente) {
    texto = texto
      .replaceAll("Me chamo {{atendente}} e vou", "Vou")
      .replaceAll("Aqui é {{atendente}}, ", "")
      .replaceAll("Aqui é {{atendente}}. ", "")
      .replaceAll("Aqui é {{atendente}}.", "")
      .replaceAll("Aqui é {{atendente}}", "");
  }

  return texto
    .replaceAll("{{nome}}", nome)
    .replaceAll("{{empresa}}", empresa)
    .replaceAll("{{atendente}}", atendente)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type ConversaoMeta = {
  /** Corpo com variáveis posicionais `{{1}}`, `{{2}}`… */
  texto: string;
  /** Nomes das variáveis na ordem posicional: mapa[0] é `{{1}}`. */
  mapa: VariavelFrase[];
  /** Exemplos na mesma ordem do mapa (exigidos pela Meta). */
  exemplos: string[];
};

const RE_VARIAVEL = /\{\{\s*(nome|empresa|atendente)\s*\}\}/g;

/**
 * Converte uma frase pronta em corpo de template da Meta.
 *
 * - Cada variável vira `{{n}}` pela ordem da PRIMEIRA aparição.
 * - Quebras de linha duplas, tabs e espaços repetidos são normalizados.
 * - A Meta rejeita corpo que comece ou termine com variável (pontuação final
 *   não conta). NÃO corrigimos automaticamente: use `validarParaMeta`.
 */
export function converterParaMeta(corpo: string): ConversaoMeta {
  const mapa: VariavelFrase[] = [];
  let texto = String(corpo ?? "").replace(RE_VARIAVEL, (_m, nome: string) => {
    const v = nome as VariavelFrase;
    let pos = mapa.indexOf(v);
    if (pos === -1) {
      mapa.push(v);
      pos = mapa.length - 1;
    }
    return `{{${pos + 1}}}`;
  });

  texto = texto
    .replace(/\t/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();

  return { texto, mapa, exemplos: mapa.map((v) => EXEMPLOS_VARIAVEL[v]) };
}

export const MSG_VARIAVEL_BORDA =
  "A Meta não aceita variável no início ou no fim do texto — reescreva terminando com uma palavra";

/**
 * Problemas que fariam a Meta recusar o modelo. Pontuação e espaços em volta
 * da variável não contam: `"...para a {{empresa}}."` continua terminando com
 * variável aos olhos da Meta.
 */
export function validarParaMeta(corpo: string): string[] {
  const { texto } = converterParaMeta(corpo);
  const problemas: string[] = [];
  const inicio = texto.replace(/^[\s"'“”«»(\[]+/u, "");
  const fim = texto.replace(/[\s.,!?;:…)\]"'“”»]+$/u, "");
  if (/^\{\{\d+\}\}/.test(inicio) || /\{\{\d+\}\}$/.test(fim)) {
    problemas.push(MSG_VARIAVEL_BORDA);
  }
  return problemas;
}


/**
 * Nome de template válido para a Meta: minúsculas, sem acento, só
 * `[a-z0-9_]`, prefixo `crm_` e no máximo 60 caracteres.
 */
export function slugMeta(titulo: string): string {
  const base = String(titulo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
  return `crm_${base}`.slice(0, 60).replace(/_+$/, "");
}

/** Valores dos parâmetros do template, na ordem posicional do mapa. */
export function preencherParamsMeta(
  mapa: Array<string | null | undefined>,
  vars: ValoresFrase,
): string[] {
  const nome = (vars.nome ?? "").trim() || "cliente";
  const empresa = (vars.empresa ?? "").trim() || "sua empresa";
  const atendente = (vars.atendente ?? "").trim() || "equipe comercial";
  const fonte: Record<string, string> = { nome, empresa, atendente };
  return (mapa ?? []).map((v) => fonte[String(v ?? "")] ?? "");
}

/** Nomes de empresa que nunca podem aparecer em texto voltado ao cliente. */
const EMPRESAS_PROIBIDAS = ["taoplast", "tao plast", "inplastic", "licitaplas"];

export const MSG_EMPRESA_PROIBIDA = "Frases não podem citar nome de empresa";

/** True quando o corpo cita alguma das empresas do grupo. */
export function citaNomeDeEmpresa(corpo: string): boolean {
  const t = String(corpo ?? "").toLowerCase();
  return EMPRESAS_PROIBIDAS.some((e) => t.includes(e));
}

/** Variáveis `{{x}}` usadas no corpo que não fazem parte do catálogo. */
export function variaveisInvalidas(corpo: string): string[] {
  const achadas = [...String(corpo ?? "").matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) =>
    String(m[1]),
  );
  return [...new Set(achadas.filter((v) => !(VARIAVEIS as readonly string[]).includes(v)))];
}
