/**
 * Duplicidade de cadastro: quem é o dono (regras puras, sem banco).
 *
 * Regra de negócio (decisão do Denis, set/2026): quando o CNPJ/CPF já existe,
 * o vendedor SEMPRE vê o nome do dono e a equipe dele — inclusive entre
 * equipes — para poder falar com o colega. Nada além disso é revelado: razão
 * social, contatos, valores, histórico e ids continuam fora do alcance de quem
 * não enxerga o registro.
 */

export type DonoCadastro = {
  existe: boolean;
  /** Registro sem vendedor responsável (sem dono, inativo ou excluído). */
  semDono: boolean;
  donoNome: string | null;
  donoEquipe: string | null;
  /** A pessoa já enxerga o registro pela visibilidade normal do sistema. */
  podeVerRegistro: boolean;
  /** Nome da empresa cadastrada — só quando `podeVerRegistro`. */
  empresa: string | null;
  /** Dono é de OUTRA equipe (usado para auditar a revelação). */
  outraEquipe: boolean;
};

export const DONO_NAO_ENCONTRADO: DonoCadastro = {
  existe: false,
  semDono: false,
  donoNome: null,
  donoEquipe: null,
  podeVerRegistro: false,
  empresa: null,
  outraEquipe: false,
};

export const MSG_CONSULTA_INDISPONIVEL =
  "Não foi possível verificar agora. Tente novamente em instantes.";

/** Normaliza documento (CNPJ/CPF): só dígitos, dos dois lados da comparação. */
export function normalizarDocumento(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** Mascara o documento para a trilha de auditoria: só os 4 últimos dígitos. */
export function mascararDocumento(v: string | null | undefined): string {
  const d = normalizarDocumento(v);
  if (!d) return "****";
  return `****${d.slice(-4)}`;
}

/** Texto da trilha quando a consulta revela um dono de outra equipe. */
export function textoAuditoriaConsulta(documento: string | null | undefined, equipe: string | null): string {
  return `consulta de dono: CNPJ ${mascararDocumento(documento)} → equipe ${equipe ?? "sem equipe"}`;
}

/** Mensagem exibida quando o cadastro já existe. */
export function mensagemDonoDuplicado(info: DonoCadastro): string {
  if (!info.existe) return "";
  if (info.semDono || !info.donoNome) {
    return "Já existe cadastro deste CNPJ, sem vendedor responsável. Fale com o administrador.";
  }
  const equipe = info.donoEquipe ? ` (Equipe ${info.donoEquipe})` : "";
  const empresa = info.podeVerRegistro && info.empresa ? ` Cadastro: ${info.empresa}.` : "";
  return `Já existe cadastro deste CNPJ. Dono: ${info.donoNome}${equipe}. Fale com ele antes de seguir.${empresa}`;
}

/** Mensagem do aviso de nome parecido (não bloqueia o cadastro). */
export function mensagemNomeParecido(info: DonoCadastro): string {
  if (info.semDono || !info.donoNome) {
    return "Já existe cadastro com nome parecido, sem vendedor responsável. Confira antes de duplicar.";
  }
  const equipe = info.donoEquipe ? ` (Equipe ${info.donoEquipe})` : "";
  const empresa = info.podeVerRegistro && info.empresa ? `: "${info.empresa}"` : "";
  return `Já existe cadastro com nome parecido${empresa}. Dono: ${info.donoNome}${equipe}. Confira antes de duplicar.`;
}

/**
 * O botão "Avisar o dono" abre o chat interno — que só permite conversa dentro
 * da equipe (ou com gestor/supervisor). Entre equipes fica só o nome.
 */
export function podeAvisarDono(info: DonoCadastro, mesmaEquipe: boolean): boolean {
  return info.existe && !info.semDono && !!info.donoNome && mesmaEquipe;
}

export function mensagemProntaParaDono(documento: string | null | undefined): string {
  const d = normalizarDocumento(documento);
  return `Oi, o cliente CNPJ ${d || "(sem número)"} está com você? Tenho um contato dele.`;
}
