/**
 * Tradução das recusas de senha do provedor de autenticação para português.
 * Usada nas telas de definir/trocar senha — nunca registra a senha.
 */
export function mensagemErroSenha(bruto: string): string {
  const m = String(bruto ?? "");
  if (/pwned|leaked|compromis|data breach|breaches/i.test(m)) {
    return "Esta senha já apareceu em vazamentos conhecidos. Escolha outra senha.";
  }
  if (/should be at least|too short|minimum/i.test(m)) {
    return "Senha muito curta. Use pelo menos 8 caracteres, com letras e números.";
  }
  if (/same as the old|different from the old/i.test(m)) {
    return "A nova senha deve ser diferente da anterior.";
  }
  if (/expired|invalid|not found|token|session/i.test(m)) {
    return "Este link já foi usado ou expirou. Peça um novo link.";
  }
  if (/rate limit|too many/i.test(m)) {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }
  return "Não foi possível salvar a senha. Tente novamente.";
}
