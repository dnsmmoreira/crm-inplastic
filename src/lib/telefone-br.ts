/**
 * Dado um telefone BR já normalizado (só dígitos, com DDI 55, ex: "5511987654321"
 * ou "551187654321"), retorna os formatos candidatos considerando a ambiguidade do
 * 9º dígito do celular (alguns sistemas mandam com o "9" extra depois do DDD,
 * outros sem). Sempre inclui o telefone original.
 */
export function candidatosTelefoneBR(phoneNormalizado: string): string[] {
  const p = String(phoneNormalizado ?? "").replace(/\D/g, "");
  const candidatos = new Set([p]);
  if (p.startsWith("55") && p.length >= 12) {
    const ddd = p.slice(2, 4);
    const resto = p.slice(4);
    if (resto.length === 9 && resto.startsWith("9")) {
      candidatos.add(`55${ddd}${resto.slice(1)}`); // sem o 9 extra
    } else if (resto.length === 8) {
      candidatos.add(`55${ddd}9${resto}`); // com o 9 extra
    }
  }
  return [...candidatos];
}
